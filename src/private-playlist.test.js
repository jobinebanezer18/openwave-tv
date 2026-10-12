import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrivatePlaylist, PRIVATE_PLAYLIST_MAX_BYTES } from './private-playlist.js';

test('imports named HLS streams without storing playlist metadata or duplicates', () => {
  const playlist = '#EXTM3U\n#EXTINF:-1 tvg-logo="https://example.com/logo.png",My News\nhttps://example.com/news.m3u8?token=abc\n#EXTINF:-1,Duplicate\nhttps://example.com/news.m3u8?token=abc\n#EXTINF:-1,Radio MP3\nhttps://example.com/radio.mp3\n';
  const result = parsePrivatePlaylist(playlist);
  assert.equal(result.channels.length, 1);
  assert.deepEqual(result.channels[0], { id: 'private:0', name: 'My News', url: 'https://example.com/news.m3u8?token=abc', country: '', languages: [], categories: [], logo: '' });
  assert.equal(result.skipped, 1);
});

test('preserves commas in names and ignores commas inside quoted attributes', () => {
  const result = parsePrivatePlaylist('#EXTM3U url-tvg="https://example.com/guide.xml"\n#EXTINF:-1 tvg-id="a,b",News, Live\nhttps://example.com/live.m3u8');
  assert.equal(result.channels[0].name, 'News, Live');
});

test('rejects invalid playlists and credentials in stream URL', () => {
  assert.throws(() => parsePrivatePlaylist('plain text'), /M3U playlist/);
  assert.throws(() => parsePrivatePlaylist('#EXTM3U\n#EXTINF:-1,Secret\nhttps://user:pass@example.com/a.m3u8'), /No playable HLS/);
  assert.throws(() => parsePrivatePlaylist('#EXTM3U\n#EXTINF:-1,Empty\nhttp://example.com/a.mp4'), /No playable HLS/);
  assert.throws(() => parsePrivatePlaylist('#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,Segment\nhttps://example.com/seg.m3u8'), /stream manifest/);
});

test('enforces file and channel caps', () => {
  assert.throws(() => parsePrivatePlaylist('x'.repeat(PRIVATE_PLAYLIST_MAX_BYTES + 1)), /smaller than 1 MB/);
  const many = '#EXTM3U\n' + Array.from({ length: 501 }, (_, i) => `#EXTINF:-1,Channel ${i}\nhttps://example.com/${i}.m3u8\n`).join('');
  assert.throws(() => parsePrivatePlaylist(many), /more than 500/);
});
