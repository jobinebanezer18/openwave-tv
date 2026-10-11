package main

import (
	"net/url"
	"strings"
	"testing"
)

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
