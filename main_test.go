package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestLocalOnlyRejectsHostAndCrossOrigin(t *testing.T) {
	handler := localOnly(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	tests := []struct {
		name, host, origin string
		want               int
	}{
		{"normal localhost", "127.0.0.1:8765", "http://127.0.0.1:8765", http.StatusNoContent},
		{"vite forwarded host", "127.0.0.1:5173", "http://127.0.0.1:5173", http.StatusNoContent},
		{"local CLI without Origin", "localhost:8765", "", http.StatusNoContent},
		{"IPv6 loopback", "[::1]:8765", "http://[::1]:8765", http.StatusNoContent},
		{"DNS rebinding host", "watch.example:8765", "http://watch.example:8765", http.StatusForbidden},
		{"private LAN host", "192.168.1.20:8765", "http://192.168.1.20:8765", http.StatusForbidden},
		{"hostile origin", "127.0.0.1:8765", "https://watch.example", http.StatusForbidden},
		{"other local origin", "127.0.0.1:8765", "http://127.0.0.1:5173", http.StatusForbidden},
		{"null origin", "127.0.0.1:8765", "null", http.StatusForbidden},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/session", strings.NewReader(`{"id":"news"}`))
			r.Host = tc.host
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("got HTTP %d, want %d", w.Code, tc.want)
			}
		})
	}
	r := httptest.NewRequest(http.MethodPost, "/api/session", strings.NewReader(`{"id":"news"}`))
	r.Host = "127.0.0.1:8765"
	r.Header.Set("Sec-Fetch-Site", "cross-site")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("cross-site request without Origin returned HTTP %d", w.Code)
	}
}

func TestCreateSessionRejectsWrongTypeAndOversizedBody(t *testing.T) {
	s := &server{}
	tests := []struct {
		name, contentType, body string
		unknownLength           bool
		want                    int
	}{
		{"form POST", "application/x-www-form-urlencoded", `{"id":"news"}`, false, http.StatusUnsupportedMediaType},
		{"plain POST", "text/plain", `{"id":"news"}`, false, http.StatusUnsupportedMediaType},
		{"oversized known length", "application/json", fmt.Sprintf(`{"id":"%s"}`, strings.Repeat("a", maxSessionRequestBytes)), false, http.StatusRequestEntityTooLarge},
		{"oversized streaming body", "application/json", fmt.Sprintf(`{"id":"%s"}`, strings.Repeat("a", maxSessionRequestBytes)), true, http.StatusRequestEntityTooLarge},
		{"extra JSON document", "application/json", `{"id":"news"}{"id":"news"}`, false, http.StatusBadRequest},
		{"unknown field", "application/json", `{"id":"news","url":"https://example.com/live.m3u8"}`, false, http.StatusBadRequest},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/session", strings.NewReader(tc.body))
			r.Header.Set("Content-Type", tc.contentType)
			if tc.unknownLength {
				r.ContentLength = -1
			}
			w := httptest.NewRecorder()
			s.createSession(w, r)
			if w.Code != tc.want {
				t.Fatalf("got HTTP %d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
}

func TestSessionProxyURLLimit(t *testing.T) {
	base, _ := url.Parse("https://example.com/live/index.m3u8")
	sess := &session{urls: map[string]string{"0": base.String()}}
	first := sess.proxyURL("segment-1.ts", base, "token")
	if first == "" {
		t.Fatal("first media resource was rejected")
	}
	for i := 2; i < maxSessionURLs+20; i++ {
		if got := sess.proxyURL(fmt.Sprintf("segment-%d.ts", i), base, "token"); got == "" {
			t.Fatalf("resource %d rejected", i)
		}
	}
	if len(sess.urls) != maxSessionURLs || len(sess.urlOrder) != maxSessionURLs-1 {
		t.Fatalf("session stored %d URLs and %d ordered keys", len(sess.urls), len(sess.urlOrder))
	}
	if _, exists := sess.urls["0"]; !exists {
		t.Fatal("root playlist URL was evicted")
	}
	if got := strings.TrimPrefix(first, "/api/media/token/"); sess.urls[got] != "" {
		t.Fatal("stale first segment URL was not evicted")
	}
}

func TestRewritePlaylistResolvesSegmentsAndKeys(t *testing.T) {
	base, _ := url.Parse("https://example.com/live/playlist.m3u8")
	sess := &session{urls: map[string]string{}}
	manifest := "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXTINF:4,\nseg1.ts\n"
	result := rewritePlaylist(manifest, base, "abc", sess)
	if strings.Contains(result, "URI=\"key.bin\"") || strings.Contains(result, "\nseg1.ts\n") {
		t.Fatal("playlist kept unproxied media URLs")
	}
	if len(sess.urls) != 2 {
		t.Fatalf("expected key and segment URLs, got %d", len(sess.urls))
	}
	for _, target := range sess.urls {
		if target != "https://example.com/live/key.bin" && target != "https://example.com/live/seg1.ts" {
			t.Fatalf("unexpected URL: %s", target)
		}
	}
}

func TestValidURLRejectsPrivateNetwork(t *testing.T) {
	for _, raw := range []string{"http://127.0.0.1/live.m3u8", "http://192.168.1.2/live.m3u8", "file:///tmp/playlist.m3u8"} {
		u, _ := url.Parse(raw)
		if validURL(u) == nil {
			t.Fatalf("accepted unsafe URL: %s", raw)
		}
	}
}

func TestParseM3UAndAppendMatchedBackup(t *testing.T) {
	data := "#EXTM3U\n#EXTINF:-1 tvg-id=\"News.us\" group-title=\"United States\",News HD\n#EXTVLCOPT:http-referrer=https://example.org/\nhttps://example.org/live/index.m3u8\n"
	byID := map[string]channel{"News.us": {ID: "News.us", Name: "News", Languages: []string{"eng"}, Streams: []streamSource{{Stream: apiStream{URL: "https://first.example/live.m3u8"}}}}}
	parseM3U(data, func(metadata string, stream apiStream) {
		if id := m3uAttr(metadata, "tvg-id"); id != "News.us" {
			t.Errorf("wrong channel ID: %q", id)
		}
		if stream.Referrer != "https://example.org/" {
			t.Errorf("referrer lost: %q", stream.Referrer)
		}
		if !appendBackup(byID, "News.us", stream) {
			t.Error("valid backup was not added")
		}
	})
	if got := byID["News.us"].Sources; got != 2 {
		t.Fatalf("expected two sources, got %d", got)
	}
	if appendBackup(byID, "News.us", apiStream{URL: "https://example.org/live/index.m3u8"}) {
		t.Error("duplicate backup was added")
	}
}

func TestNormalizedNameStripsQualitySuffix(t *testing.T) {
	if got := normalizedName("BBC News (720p)"); got != normalizedName("BBC News") {
		t.Fatalf("quality suffix changed match: %q", got)
	}
}

func TestSegmentHasMediaRejectsNullPackets(t *testing.T) {
	nullPacket := make([]byte, 188)
	nullPacket[0], nullPacket[1], nullPacket[2] = 0x47, 0x1f, 0xff
	if segmentHasMedia(nullPacket) || segmentHasMedia([]byte("no media")) {
		t.Fatal("accepted an empty segment")
	}
	packets := make([]byte, 188*6)
	for offset := 0; offset < len(packets); offset += 188 {
		copy(packets[offset:offset+188], nullPacket)
	}
	if segmentHasMedia(packets) {
		t.Fatal("accepted a segment containing only null packets")
	}
	packets[188+1], packets[188+2] = 0, 0
	if !segmentHasMedia(packets) {
		t.Fatal("rejected a segment with a non-null transport packet")
	}
}

func TestDeadChannelIsRemovedFromGuide(t *testing.T) {
	first := channel{ID: "first", Name: "First"}
	dead := channel{ID: "dead", Name: "Dead"}
	s := &server{catalog: catalog{Channels: []channel{first, dead}, Loaded: time.Now()}, dead: map[string]time.Time{}}
	s.setChannelDead("dead", true)
	recorder := httptest.NewRecorder()
	s.channels(recorder, httptest.NewRequest("GET", "/api/channels", nil))
	if recorder.Code != 200 {
		t.Fatalf("guide returned %d", recorder.Code)
	}
	var guide struct {
		Channels []channel `json:"channels"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &guide); err != nil {
		t.Fatal(err)
	}
	if len(guide.Channels) != 1 || guide.Channels[0].ID != "first" {
		t.Fatalf("dead channel remained in guide: %+v", guide.Channels)
	}
}
