export const PRIVATE_PLAYLIST_MAX_BYTES = 1024 * 1024;
export const PRIVATE_PLAYLIST_MAX_CHANNELS = 500;

function streamURL(value) {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (!/\.m3u8$/i.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function nameFromExtinf(line) {
  let quoted = false;
  let separator = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && line[i - 1] !== '\\') quoted = !quoted;
    else if (line[i] === ',' && !quoted) { separator = i; break; }
  }
  const name = separator < 0 ? '' : line.slice(separator + 1).trim();
  return name.slice(0, 100);
}

export function parsePrivatePlaylist(text) {
  if (new TextEncoder().encode(text).length > PRIVATE_PLAYLIST_MAX_BYTES) throw new Error('Choose a playlist smaller than 1 MB.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!/^#EXTM3U(?:\s|$)/.test(lines[0]?.trim() || '')) throw new Error('Choose an M3U playlist that starts with #EXTM3U.');
  if (lines.some(line => line.trim().startsWith('#EXT-X-'))) throw new Error('This is an HLS stream manifest. Choose a channel-list M3U file.');
  const channels = [];
  const seen = new Set();
  let pendingName = '';
  let skipped = 0;
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      pendingName = nameFromExtinf(line);
      continue;
    }
    if (!line || line.startsWith('#')) continue;
    const url = streamURL(line);
    if (!url || !pendingName) {
      skipped++;
      pendingName = '';
      continue;
    }
    if (!seen.has(url)) {
      if (channels.length >= PRIVATE_PLAYLIST_MAX_CHANNELS) throw new Error('This playlist has more than 500 channels. Choose a smaller file.');
      channels.push({ id: `private:${channels.length}`, name: pendingName, url, country: '', languages: [], categories: [], logo: '' });
      seen.add(url);
    }
    pendingName = '';
  }
  if (!channels.length) throw new Error('No playable HLS channels found. Use an M3U file with named .m3u8 streams.');
  return { channels, skipped };
}
