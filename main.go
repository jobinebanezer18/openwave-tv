package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

//go:embed dist/*
var webFiles embed.FS

const apiBase = "https://dearbulut.github.io/iptv/api/v1/"
const freeTVPlaylist = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8"
const worldTVPlaylist = "https://romaxa55.github.io/world_ip_tv/output/index.m3u"

const maxSessionRequestBytes = 1024
const maxSessions = 256
const maxProbeCacheEntries = 2048
const maxSessionURLs = 512
const maxConcurrentProbes = 8

var specialUseIPRanges = [...]netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("2001::/23"),
}

type apiChannel struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Country    string   `json:"country"`
	Categories []string `json:"categories"`
	NSFW       bool     `json:"is_nsfw"`
}
type apiStream struct {
	Channel   string   `json:"channel"`
	Feed      string   `json:"feed"`
	Title     string   `json:"title"`
	URL       string   `json:"url"`
	Quality   string   `json:"quality"`
	Labels    []string `json:"labels"`
	UserAgent string   `json:"user_agent"`
	Referrer  string   `json:"referrer"`
	Health    struct {
		Status string `json:"status"`
	} `json:"health"`
}
type apiOnlineChannel struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Country    string      `json:"country"`
	Categories []string    `json:"categories"`
	Languages  []string    `json:"languages"`
	NSFW       bool        `json:"is_nsfw"`
	Online     bool        `json:"online"`
	Score      float64     `json:"score"`
	Logo       string      `json:"logo"`
	Streams    []apiStream `json:"streams"`
}
type apiFeed struct {
	Channel   string   `json:"channel"`
	ID        string   `json:"id"`
	IsMain    bool     `json:"is_main"`
	Languages []string `json:"languages"`
}
type language struct {
	Code string `json:"code"`
	Name string `json:"name"`
}
type apiLogo struct {
	Channel string `json:"channel"`
	URL     string `json:"url"`
	InUse   bool   `json:"in_use"`
}
type country struct {
	Name string `json:"name"`
	Code string `json:"code"`
}
type channel struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Title       string         `json:"title"`
	Country     string         `json:"country"`
	Categories  []string       `json:"categories"`
	Languages   []string       `json:"languages"`
	Quality     string         `json:"quality"`
	Logo        string         `json:"logo"`
	Featured    bool           `json:"featured"`
	HealthScore float64        `json:"health_score"`
	Sources     int            `json:"sources"`
	Streams     []streamSource `json:"-"`
}
type streamSource struct {
	Stream    apiStream
	Languages []string
}
type catalog struct {
	Channels  []channel          `json:"channels"`
	Countries []country          `json:"countries"`
	Languages []language         `json:"languages"`
	ByID      map[string]channel `json:"-"`
	Loaded    time.Time          `json:"-"`
}
type session struct {
	stream   apiStream
	urls     map[string]string
	urlOrder []string
	mu       sync.Mutex
	expires  time.Time
}
type server struct {
	mu         sync.Mutex
	catalog    catalog
	sessions   map[string]*session
	client     *http.Client
	probeMu    sync.Mutex
	probeCache map[string]probeResult
	probeSlots chan struct{}
	deadMu     sync.Mutex
	dead       map[string]time.Time
}
type probeResult struct {
	OK bool
	At time.Time
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8765", "local listen address")
	noBrowser := flag.Bool("no-browser", false, "do not open browser automatically")
	flag.Parse()
	if !localHost(*addr) {
		log.Fatal("listen address must use localhost or a loopback IP")
	}
	s := &server{sessions: map[string]*session{}, probeCache: map[string]probeResult{}, probeSlots: make(chan struct{}, maxConcurrentProbes), dead: map[string]time.Time{}, client: safeClient()}
	mux := http.NewServeMux()
	var appServer *http.Server
	mux.HandleFunc("GET /api/channels", s.channels)
	mux.HandleFunc("POST /api/session", s.createSession)
	mux.HandleFunc("POST /api/private-session", s.createPrivateSession)
	mux.HandleFunc("GET /api/media/{session}/{resource}", s.media)
	mux.HandleFunc("POST /api/quit", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-OpenWave-Action") != "quit" {
			http.Error(w, "Invalid app action", http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusAccepted)
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = appServer.Shutdown(ctx)
		}()
	})
	mux.HandleFunc("GET /", s.static)
	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatalf("OpenWave could not start on %s (another copy or app may be using the port): %v", *addr, err)
	}
	localURL := "http://" + listener.Addr().String()
	log.Printf("OpenWave TV: %s", localURL)
	if !*noBrowser {
		go openBrowser(localURL)
	}
	appServer = &http.Server{
		Handler:           localOnly(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := appServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

// A loopback listener alone is not enough: a hostile website can submit blind
// requests to a local server, and DNS rebinding can supply a non-local Host.
func localOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !localHost(r.Host) {
			http.Error(w, "Invalid local host", http.StatusForbidden)
			return
		}
		if r.Method == http.MethodPost {
			if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
				http.Error(w, "Cross-site request denied", http.StatusForbidden)
				return
			}
			origin := r.Header.Get("Origin")
			if origin != "" {
				u, err := url.Parse(origin)
				if err != nil || u.Scheme != "http" || u.Host != r.Host || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
					http.Error(w, "Invalid request origin", http.StatusForbidden)
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func localHost(host string) bool {
	u, err := url.Parse("http://" + host)
	if err != nil || u.Host != host || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	name := strings.ToLower(u.Hostname())
	if name == "localhost" || name == "localhost." {
		return true
	}
	ip := net.ParseIP(name)
	return ip != nil && ip.IsLoopback()
}

func safeClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{
		// A configured HTTP proxy could resolve a public-looking stream hostname
		// to a private address on our behalf, bypassing the dial-time IP check.
		Proxy: nil,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			for _, ip := range ips {
				if publicIP(ip.IP) {
					return dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
				}
			}
			return nil, errors.New("stream host resolves to a private address")
		},
		MaxIdleConns: 32, IdleConnTimeout: 30 * time.Second,
		ResponseHeaderTimeout: 20 * time.Second,
	}
	return &http.Client{Transport: transport, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		return validURL(req.URL)
	}}
}

func publicIP(ip net.IP) bool {
	if ip == nil || !ip.IsGlobalUnicast() || ip.IsPrivate() {
		return false
	}
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	address = address.Unmap()
	// Go's IsPrivate does not include carrier-grade NAT, benchmark ranges, or
	// other special-use networks that may be reachable within a local network.
	for _, prefix := range specialUseIPRanges {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}

func validURL(u *url.URL) error {
	if u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
		return errors.New("invalid stream URL")
	}
	name := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if name == "localhost" || strings.HasSuffix(name, ".localhost") {
		return errors.New("private stream URL")
	}
	if ip := net.ParseIP(u.Hostname()); ip != nil && !publicIP(ip) {
		return errors.New("private stream URL")
	}
	return nil
}

func fetchJSON[T any](client *http.Client, name string, dest *T) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", apiBase+name+".json", nil)
	req.Header.Set("User-Agent", "OpenWaveTV/0.1 (+https://github.com/jobinebanezer18/openwave-tv)")
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("%s: HTTP %d", name, res.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(res.Body, 30<<20)).Decode(dest)
}

func fetchPlaylist(client *http.Client, address string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 18*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", address, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "OpenWaveTV/0.2 (+https://github.com/jobinebanezer18/openwave-tv)")
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", fmt.Errorf("playlist HTTP %d", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	return string(data), err
}

func m3uAttr(line, key string) string {
	marker := key + `="`
	start := strings.Index(line, marker)
	if start < 0 {
		return ""
	}
	rest := line[start+len(marker):]
	end := strings.IndexByte(rest, '"')
	if end < 0 {
		return ""
	}
	return rest[:end]
}

func parseM3U(data string, visit func(metadata string, stream apiStream)) {
	var metadata string
	var stream apiStream
	for _, raw := range strings.Split(data, "\n") {
		line := strings.TrimSpace(raw)
		switch {
		case strings.HasPrefix(line, "#EXTINF"):
			metadata = line
			stream = apiStream{}
		case strings.HasPrefix(line, "#EXTVLCOPT:http-referrer="):
			stream.Referrer = strings.TrimPrefix(line, "#EXTVLCOPT:http-referrer=")
		case strings.HasPrefix(line, "#EXTVLCOPT:http-user-agent="):
			stream.UserAgent = strings.TrimPrefix(line, "#EXTVLCOPT:http-user-agent=")
		case line != "" && !strings.HasPrefix(line, "#") && metadata != "":
			stream.URL = line
			if comma := strings.LastIndex(metadata, ","); comma >= 0 {
				stream.Title = strings.TrimSpace(metadata[comma+1:])
			}
			visit(metadata, stream)
			metadata = ""
		}
	}
}

func normalizedName(name string) string {
	if cut := strings.LastIndex(name, " ("); cut >= 0 && strings.HasSuffix(name, ")") {
		name = name[:cut]
	}
	name = strings.ToLower(strings.TrimSpace(name))
	for _, suffix := range []string{" hd", " fhd", " sd", " 4k"} {
		name = strings.TrimSuffix(name, suffix)
	}
	var result strings.Builder
	for _, r := range name {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			result.WriteRune(r)
		}
	}
	return result.String()
}

func appendBackup(byID map[string]channel, id string, stream apiStream) bool {
	item, ok := byID[id]
	if !ok || len(item.Streams) >= 12 {
		return false
	}
	parsed, err := url.Parse(stream.URL)
	if err != nil || validURL(parsed) != nil || !strings.Contains(strings.ToLower(parsed.Path), ".m3u8") {
		return false
	}
	for _, existing := range item.Streams {
		if existing.Stream.URL == stream.URL {
			return false
		}
	}
	item.Streams = append(item.Streams, streamSource{Stream: stream, Languages: item.Languages})
	item.Sources = len(item.Streams)
	byID[id] = item
	return true
}

func (s *server) getCatalog() (catalog, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.catalog.Loaded) < 12*time.Hour && len(s.catalog.Channels) > 0 {
		return s.catalog, nil
	}
	var channels []apiOnlineChannel
	var countries []country
	var languages []language
	if err := fetchJSON(s.client, "channels.online", &channels); err != nil {
		return s.catalog, err
	}
	if err := fetchJSON(s.client, "countries", &countries); err != nil {
		return s.catalog, err
	}
	if err := fetchJSON(s.client, "languages", &languages); err != nil {
		return s.catalog, err
	}
	byID := map[string]channel{}
	for _, meta := range channels {
		if meta.NSFW || !meta.Online {
			continue
		}
		item := channel{ID: meta.ID, Name: meta.Name, Country: meta.Country, Categories: meta.Categories, Languages: meta.Languages, Logo: meta.Logo, HealthScore: meta.Score}
		for _, st := range meta.Streams {
			parsed, err := url.Parse(st.URL)
			if err != nil || validURL(parsed) != nil || !strings.Contains(strings.ToLower(parsed.Path), ".m3u8") || st.Health.Status != "online" {
				continue
			}
			item.Streams = append(item.Streams, streamSource{Stream: st, Languages: meta.Languages})
		}
		if len(item.Streams) == 0 {
			continue
		}
		item.Title = item.Streams[0].Stream.Title
		item.Quality = item.Streams[0].Stream.Quality
		item.Sources = len(item.Streams)
		byID[item.ID] = item
	}
	// Add alternate HLS links only for channels already present in the checked catalog.
	// Free-TV supplies channel IDs; World IPTV is matched by unique name and country.
	type playlistResult struct {
		body string
		err  error
	}
	var free, world playlistResult
	var downloads sync.WaitGroup
	downloads.Add(2)
	go func() { defer downloads.Done(); free.body, free.err = fetchPlaylist(s.client, freeTVPlaylist) }()
	go func() { defer downloads.Done(); world.body, world.err = fetchPlaylist(s.client, worldTVPlaylist) }()
	downloads.Wait()
	if free.err == nil {
		parseM3U(free.body, func(metadata string, stream apiStream) {
			id := m3uAttr(metadata, "tvg-id")
			appendBackup(byID, id, stream)
		})
	}
	if world.err == nil {
		countryNames := map[string]string{}
		for _, c := range countries {
			countryNames[c.Code] = c.Name
		}
		nameAndCountry := map[string]string{}
		ambiguous := map[string]bool{}
		for _, item := range byID {
			key := normalizedName(item.Name) + "|" + normalizedName(countryNames[item.Country])
			if nameAndCountry[key] != "" {
				ambiguous[key] = true
			} else {
				nameAndCountry[key] = item.ID
			}
		}
		parseM3U(world.body, func(metadata string, stream apiStream) {
			key := normalizedName(stream.Title) + "|" + normalizedName(m3uAttr(metadata, "group-title"))
			if !ambiguous[key] {
				appendBackup(byID, nameAndCountry[key], stream)
			}
		})
	}
	result := make([]channel, 0, len(byID))
	for _, item := range byID {
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	usedLanguages := map[string]bool{}
	for _, ch := range result {
		for _, code := range ch.Languages {
			usedLanguages[code] = true
		}
	}
	activeLanguages := make([]language, 0, len(usedLanguages))
	for _, lang := range languages {
		if usedLanguages[lang.Code] {
			activeLanguages = append(activeLanguages, lang)
		}
	}
	sort.Slice(activeLanguages, func(i, j int) bool { return activeLanguages[i].Name < activeLanguages[j].Name })
	s.catalog = catalog{Channels: result, Countries: countries, Languages: activeLanguages, ByID: byID, Loaded: time.Now()}
	return s.catalog, nil
}

func (s *server) channels(w http.ResponseWriter, r *http.Request) {
	data, err := s.getCatalog()
	if err != nil && len(data.Channels) == 0 {
		http.Error(w, "Channel guide could not be loaded. Check your internet connection and try again.", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	visible := make([]channel, 0, len(data.Channels))
	for _, ch := range data.Channels {
		if !s.channelDead(ch.ID) {
			visible = append(visible, ch)
		}
	}
	json.NewEncoder(w).Encode(struct {
		Channels  []channel  `json:"channels"`
		Countries []country  `json:"countries"`
		Languages []language `json:"languages"`
	}{visible, data.Countries, data.Languages})
}

func (s *server) channelDead(id string) bool {
	s.deadMu.Lock()
	defer s.deadMu.Unlock()
	return time.Since(s.dead[id]) < 30*time.Minute
}

func (s *server) setChannelDead(id string, dead bool) {
	s.deadMu.Lock()
	defer s.deadMu.Unlock()
	if dead {
		s.dead[id] = time.Now()
	} else {
		delete(s.dead, id)
	}
}

func (s *server) createSession(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}
	if r.ContentLength > maxSessionRequestBytes {
		http.Error(w, "Request too large", http.StatusRequestEntityTooLarge)
		return
	}
	var body struct {
		ID       string `json:"id"`
		Language string `json:"language"`
		Attempt  int    `json:"attempt"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxSessionRequestBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		var sizeError *http.MaxBytesError
		if errors.As(err, &sizeError) {
			http.Error(w, "Request too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Invalid request", 400)
		return
	}
	if decoder.Decode(new(any)) != io.EOF {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if body.ID == "" || len(body.ID) > 256 || len(body.Language) > 32 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	data, err := s.getCatalog()
	if err != nil && len(data.Channels) == 0 {
		http.Error(w, "Channel guide unavailable", 502)
		return
	}
	ch, ok := data.ByID[body.ID]
	if !ok {
		http.Error(w, "Channel not found", 404)
		return
	}
	choices := make([]streamSource, 0, len(ch.Streams))
	for _, source := range ch.Streams {
		if body.Language != "" {
			match := false
			for _, lang := range source.Languages {
				if lang == body.Language {
					match = true
					break
				}
			}
			if !match {
				continue
			}
		}
		choices = append(choices, source)
	}
	if body.Attempt < 0 || body.Attempt >= len(choices) {
		http.Error(w, "No more sources", 404)
		return
	}
	if s.probeSlots != nil {
		select {
		case s.probeSlots <- struct{}{}:
			defer func() { <-s.probeSlots }()
		case <-time.After(2 * time.Second):
			http.Error(w, "Playback is busy; please retry", http.StatusTooManyRequests)
			return
		case <-r.Context().Done():
			return
		}
	}
	chosenIndex := -1
	for i := body.Attempt; i < len(choices); i++ {
		if s.probe(choices[i].Stream) {
			chosenIndex = i
			break
		}
	}
	if chosenIndex == -1 {
		if body.Attempt == 0 && len(choices) == len(ch.Streams) {
			s.setChannelDead(ch.ID, true)
		}
		http.Error(w, "No working feed is available for this channel", http.StatusServiceUnavailable)
		return
	}
	s.setChannelDead(ch.ID, false)
	chosen := choices[chosenIndex].Stream
	tokenBytes := make([]byte, 20)
	if _, err := rand.Read(tokenBytes); err != nil {
		http.Error(w, "Session error", 500)
		return
	}
	token := hex.EncodeToString(tokenBytes)
	sess := &session{stream: chosen, urls: map[string]string{"0": chosen.URL}, expires: time.Now().Add(4 * time.Hour)}
	s.mu.Lock()
	for key, old := range s.sessions {
		if time.Now().After(old.expires) {
			delete(s.sessions, key)
		}
	}
	if len(s.sessions) >= maxSessions {
		s.mu.Unlock()
		http.Error(w, "Too many active playback sessions", http.StatusTooManyRequests)
		return
	}
	s.sessions[token] = sess
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"url": "/api/media/" + token + "/0", "sources": len(choices), "sourceIndex": chosenIndex})
}

// Private streams are supplied by the viewer and remain in memory for the
// lifetime of a playback session. They never enter the shared channel guide.
func (s *server) createPrivateSession(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		http.Error(w, "Content-Type must be application/json", http.StatusUnsupportedMediaType)
		return
	}
	if r.ContentLength > maxSessionRequestBytes {
		http.Error(w, "Request too large", http.StatusRequestEntityTooLarge)
		return
	}
	var body struct {
		URL string `json:"url"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxSessionRequestBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		var sizeError *http.MaxBytesError
		if errors.As(err, &sizeError) {
			http.Error(w, "Request too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if decoder.Decode(new(any)) != io.EOF {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if len(body.URL) == 0 || len(body.URL) > 900 {
		http.Error(w, "Invalid stream URL", http.StatusBadRequest)
		return
	}
	parsed, err := url.Parse(body.URL)
	if err != nil || validURL(parsed) != nil || parsed.Fragment != "" {
		http.Error(w, "Unsupported stream URL", http.StatusBadRequest)
		return
	}
	if s.probeSlots != nil {
		select {
		case s.probeSlots <- struct{}{}:
			defer func() { <-s.probeSlots }()
		case <-time.After(2 * time.Second):
			http.Error(w, "Playback is busy; please retry", http.StatusTooManyRequests)
			return
		case <-r.Context().Done():
			return
		}
	}
	if !s.privateHLS(r.Context(), body.URL) {
		http.Error(w, "This link is not an available HLS stream", http.StatusUnprocessableEntity)
		return
	}
	stream := apiStream{URL: body.URL}
	if !s.probe(stream) {
		http.Error(w, "No playable media is available at this link", http.StatusServiceUnavailable)
		return
	}
	tokenBytes := make([]byte, 20)
	if _, err := rand.Read(tokenBytes); err != nil {
		http.Error(w, "Session error", http.StatusInternalServerError)
		return
	}
	token := hex.EncodeToString(tokenBytes)
	sess := &session{stream: stream, urls: map[string]string{"0": body.URL}, expires: time.Now().Add(4 * time.Hour)}
	s.mu.Lock()
	for key, old := range s.sessions {
		if time.Now().After(old.expires) {
			delete(s.sessions, key)
		}
	}
	if len(s.sessions) >= maxSessions {
		s.mu.Unlock()
		http.Error(w, "Too many active playback sessions", http.StatusTooManyRequests)
		return
	}
	if s.sessions == nil {
		s.sessions = make(map[string]*session)
	}
	s.sessions[token] = sess
	s.mu.Unlock()
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"url": "/api/media/" + token + "/0", "sources": 1, "sourceIndex": 0})
}

func (s *server) privateHLS(parent context.Context, rawURL string) bool {
	ctx, cancel := context.WithTimeout(parent, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 OpenWaveTV/0.1")
	res, err := s.client.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return false
	}
	// The media proxy must recognize this URL as a playlist too; otherwise it
	// would forward the manifest without rewriting its nested media links.
	contentType := strings.ToLower(res.Header.Get("Content-Type"))
	if !strings.Contains(contentType, "mpegurl") && !strings.Contains(strings.ToLower(res.Request.URL.Path), ".m3u8") {
		return false
	}
	const maxManifestBytes = 256 << 10
	data, err := io.ReadAll(io.LimitReader(res.Body, maxManifestBytes+1))
	if err != nil || len(data) > maxManifestBytes {
		return false
	}
	manifest := strings.TrimPrefix(strings.TrimSpace(string(data)), "\ufeff")
	if !strings.HasPrefix(manifest, "#EXTM3U\n") && !strings.HasPrefix(manifest, "#EXTM3U\r\n") {
		return false
	}
	for _, line := range strings.Split(manifest, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "#EXT-X-") {
			return true
		}
	}
	return false
}

func (s *server) probe(st apiStream) bool {
	s.probeMu.Lock()
	if cached, ok := s.probeCache[st.URL]; ok && time.Since(cached.At) < 10*time.Minute {
		s.probeMu.Unlock()
		return cached.OK
	}
	s.probeMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	current := st.URL
	ok := false
	for depth := 0; depth < 3; depth++ {
		req, err := http.NewRequestWithContext(ctx, "GET", current, nil)
		if err != nil {
			break
		}
		if st.UserAgent != "" {
			req.Header.Set("User-Agent", st.UserAgent)
		} else {
			req.Header.Set("User-Agent", "Mozilla/5.0 OpenWaveTV/0.1")
		}
		if st.Referrer != "" {
			req.Header.Set("Referer", st.Referrer)
		}
		res, err := s.client.Do(req)
		if err != nil {
			break
		}
		if res.StatusCode != 200 {
			res.Body.Close()
			break
		}
		data, err := io.ReadAll(io.LimitReader(res.Body, 256<<10))
		res.Body.Close()
		if err != nil || !strings.HasPrefix(strings.TrimSpace(string(data)), "#EXTM3U") {
			break
		}
		base := res.Request.URL
		var entries []string
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.HasPrefix(line, "#") {
				entries = append(entries, line)
			}
		}
		if len(entries) == 0 {
			break
		}
		ref, err := url.Parse(entries[0])
		if err != nil {
			break
		}
		resolved := base.ResolveReference(ref)
		if validURL(resolved) != nil {
			break
		}
		current = resolved.String()
		if !strings.Contains(strings.ToLower(resolved.Path), ".m3u8") {
			// Check the newest two media segments; a healthy playlist can briefly
			// carry old media while its current segments are empty.
			start := len(entries) - 2
			if start < 0 {
				start = 0
			}
			ok = true
			for _, entry := range entries[start:] {
				segmentRef, err := url.Parse(entry)
				if err != nil {
					ok = false
					break
				}
				segmentURL := base.ResolveReference(segmentRef)
				if validURL(segmentURL) != nil || !s.probeSegment(ctx, st, segmentURL.String()) {
					ok = false
					break
				}
			}
			break
		}
	}
	s.probeMu.Lock()
	if s.probeCache == nil {
		s.probeCache = make(map[string]probeResult)
	}
	if len(s.probeCache) >= maxProbeCacheEntries {
		var oldestKey string
		var oldestTime time.Time
		for key, entry := range s.probeCache {
			if oldestKey == "" || entry.At.Before(oldestTime) {
				oldestKey, oldestTime = key, entry.At
			}
		}
		delete(s.probeCache, oldestKey)
	}
	s.probeCache[st.URL] = probeResult{OK: ok, At: time.Now()}
	s.probeMu.Unlock()
	return ok
}

func (s *server) probeSegment(ctx context.Context, st apiStream, rawURL string) bool {
	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Range", "bytes=0-16383")
	if st.UserAgent != "" {
		req.Header.Set("User-Agent", st.UserAgent)
	}
	if st.Referrer != "" {
		req.Header.Set("Referer", st.Referrer)
	}
	res, err := s.client.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	if res.StatusCode != 200 && res.StatusCode != 206 {
		return false
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, 16<<10))
	return err == nil && segmentHasMedia(data)
}

// Some broken HLS feeds answer with one MPEG-TS null packet. That is a live
// playlist and a successful HTTP response, but it cannot produce a video frame.
func segmentHasMedia(data []byte) bool {
	if len(data) < 1024 {
		return false
	}
	if data[0] != 0x47 || len(data) < 188*2 || data[188] != 0x47 {
		return true
	}
	for offset := 0; offset+188 <= len(data); offset += 188 {
		if data[offset] != 0x47 {
			return false
		}
		pid := uint16(data[offset+1]&0x1f)<<8 | uint16(data[offset+2])
		if pid != 0x1fff {
			return true
		}
	}
	return false
}

func (s *server) media(w http.ResponseWriter, r *http.Request) {
	token, resource := r.PathValue("session"), r.PathValue("resource")
	s.mu.Lock()
	sess := s.sessions[token]
	s.mu.Unlock()
	if sess == nil || time.Now().After(sess.expires) {
		http.Error(w, "Playback session expired", 404)
		return
	}
	sess.mu.Lock()
	rawURL, ok := sess.urls[resource]
	sess.mu.Unlock()
	if !ok {
		http.Error(w, "Media not found", 404)
		return
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || validURL(parsed) != nil {
		http.Error(w, "Unsupported stream URL", 400)
		return
	}
	req, _ := http.NewRequestWithContext(r.Context(), "GET", rawURL, nil)
	if sess.stream.UserAgent != "" {
		req.Header.Set("User-Agent", sess.stream.UserAgent)
	} else {
		req.Header.Set("User-Agent", "Mozilla/5.0 OpenWaveTV/0.1")
	}
	if sess.stream.Referrer != "" {
		req.Header.Set("Referer", sess.stream.Referrer)
	}
	if value := r.Header.Get("Range"); value != "" {
		req.Header.Set("Range", value)
	}
	res, err := s.client.Do(req)
	if err != nil {
		http.Error(w, "Stream is unavailable", 502)
		return
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		http.Error(w, "Stream returned HTTP "+res.Status, 502)
		return
	}
	contentType := res.Header.Get("Content-Type")
	isManifest := strings.Contains(strings.ToLower(contentType), "mpegurl") || strings.HasSuffix(strings.ToLower(res.Request.URL.Path), ".m3u8")
	if isManifest {
		content, err := io.ReadAll(io.LimitReader(res.Body, 5<<20))
		if err != nil {
			http.Error(w, "Playlist unavailable", 502)
			return
		}
		if len(content) >= 5<<20 {
			http.Error(w, "Playlist too large", 502)
			return
		}
		rewritten := rewritePlaylist(string(content), res.Request.URL, token, sess)
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Cache-Control", "no-store")
		io.WriteString(w, rewritten)
		return
	}
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	} else if ct := mime.TypeByExtension(strings.ToLower(filepath.Ext(res.Request.URL.Path))); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	for _, header := range []string{"Content-Length", "Content-Range", "Accept-Ranges"} {
		if value := res.Header.Get(header); value != "" {
			w.Header().Set(header, value)
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(res.StatusCode)
	io.Copy(w, res.Body)
}

func rewritePlaylist(content string, base *url.URL, token string, sess *session) string {
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			if strings.Contains(line, `URI="`) {
				before, after, _ := strings.Cut(line, `URI="`)
				value, rest, found := strings.Cut(after, `"`)
				if found {
					line = before + `URI="` + sess.proxyURL(value, base, token) + `"` + rest
				}
			}
			lines[i] = line
		} else {
			lines[i] = sess.proxyURL(trimmed, base, token)
		}
	}
	return strings.Join(lines, "\n")
}

func (sess *session) proxyURL(raw string, base *url.URL, token string) string {
	ref, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	resolved := base.ResolveReference(ref)
	if validURL(resolved) != nil {
		return ""
	}
	bytes := sha256.Sum256([]byte(resolved.String()))
	key := hex.EncodeToString(bytes[:12])
	sess.mu.Lock()
	if _, exists := sess.urls[key]; !exists {
		if len(sess.urls) >= maxSessionURLs && len(sess.urlOrder) > 0 {
			delete(sess.urls, sess.urlOrder[0])
			sess.urlOrder = sess.urlOrder[1:]
		}
		sess.urlOrder = append(sess.urlOrder, key)
	}
	sess.urls[key] = resolved.String()
	sess.mu.Unlock()
	return "/api/media/" + token + "/" + key
}

func (s *server) static(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}
	if strings.Contains(path, "..") {
		http.NotFound(w, r)
		return
	}
	data, err := webFiles.ReadFile("dist/" + path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if ct := mime.TypeByExtension(strings.ToLower(filepath.Ext(path))); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Write(data)
}

func openBrowser(address string) {
	time.Sleep(250 * time.Millisecond)
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", address)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", address)
	default:
		cmd = exec.Command("xdg-open", address)
	}
	_ = cmd.Start()
}
