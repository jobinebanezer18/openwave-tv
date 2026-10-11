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
	"net/url"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed dist/*
var webFiles embed.FS

const apiBase = "https://dearbulut.github.io/iptv/api/v1/"

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
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Title      string         `json:"title"`
	Country    string         `json:"country"`
	Categories []string       `json:"categories"`
	Languages  []string       `json:"languages"`
	Quality    string         `json:"quality"`
	Logo       string         `json:"logo"`
	Featured   bool           `json:"featured"`
	Sources    int            `json:"sources"`
	Streams    []streamSource `json:"-"`
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
	stream  apiStream
	urls    map[string]string
	mu      sync.Mutex
	expires time.Time
}
type server struct {
	mu         sync.Mutex
	catalog    catalog
	sessions   map[string]*session
	client     *http.Client
	probeMu    sync.Mutex
	probeCache map[string]probeResult
}
type probeResult struct {
	OK bool
	At time.Time
}

func main() {
	addr := flag.String("addr", "127.0.0.1:0", "local listen address")
	noBrowser := flag.Bool("no-browser", false, "do not open browser automatically")
	flag.Parse()
	s := &server{sessions: map[string]*session{}, probeCache: map[string]probeResult{}, client: safeClient()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/channels", s.channels)
	mux.HandleFunc("POST /api/session", s.createSession)
	mux.HandleFunc("GET /api/media/{session}/{resource}", s.media)
	mux.HandleFunc("GET /", s.static)
	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatal(err)
	}
	localURL := "http://" + listener.Addr().String()
	log.Printf("OpenWave TV: %s", localURL)
	if !*noBrowser {
		go openBrowser(localURL)
	}
	log.Fatal(http.Serve(listener, mux))
}

func safeClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
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
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	return true
}

func validURL(u *url.URL) error {
	if u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
		return errors.New("invalid stream URL")
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
		item := channel{ID: meta.ID, Name: meta.Name, Country: meta.Country, Categories: meta.Categories, Languages: meta.Languages, Logo: meta.Logo}
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
	json.NewEncoder(w).Encode(data)
}

func (s *server) createSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID       string `json:"id"`
		Language string `json:"language"`
		Attempt  int    `json:"attempt"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
		http.Error(w, "Invalid request", 400)
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
	chosenIndex := -1
	for i := body.Attempt; i < len(choices); i++ {
		if s.probe(choices[i].Stream) {
			chosenIndex = i
			break
		}
	}
	if chosenIndex == -1 {
		http.Error(w, "No working feed is available for this channel", http.StatusServiceUnavailable)
		return
	}
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
	s.sessions[token] = sess
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"url": "/api/media/" + token + "/0", "sources": len(choices), "sourceIndex": chosenIndex})
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
		var next string
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.HasPrefix(line, "#") {
				next = line
				break
			}
		}
		if next == "" {
			break
		}
		ref, err := url.Parse(next)
		if err != nil {
			break
		}
		resolved := base.ResolveReference(ref)
		if validURL(resolved) != nil {
			break
		}
		current = resolved.String()
		if !strings.Contains(strings.ToLower(resolved.Path), ".m3u8") {
			segmentReq, err := http.NewRequestWithContext(ctx, "GET", current, nil)
			if err != nil {
				break
			}
			segmentReq.Header.Set("Range", "bytes=0-1023")
			if st.UserAgent != "" {
				segmentReq.Header.Set("User-Agent", st.UserAgent)
			}
			if st.Referrer != "" {
				segmentReq.Header.Set("Referer", st.Referrer)
			}
			segmentRes, err := s.client.Do(segmentReq)
			if err != nil {
				break
			}
			if segmentRes.StatusCode == 200 || segmentRes.StatusCode == 206 {
				buf := make([]byte, 1)
				_, readErr := segmentRes.Body.Read(buf)
				ok = readErr == nil
			}
			segmentRes.Body.Close()
			break
		}
	}
	s.probeMu.Lock()
	s.probeCache[st.URL] = probeResult{OK: ok, At: time.Now()}
	s.probeMu.Unlock()
	return ok
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
