# India web beta

**Live beta:** https://openwave-india-beta.pages.dev/

This is a small, browser-only OpenWave build for direct playback on ordinary phones and computers. It does not run the desktop Go server or relay video through our hosting account. The first India guide currently contains **49 candidate channels** across news, music, local TV, culture, education, business, entertainment, and faith. Sources can change or block a viewer's region or browser; the guide count is not a promise that every feed is live.

## How it differs from the desktop preview

- TV uses direct HTTPS HLS from each stream host. The host sees the viewer's IP address and may enforce its own access rules. Browser CORS and codec support determine whether a feed plays.
- Radio still uses direct station audio and the bundled station guide.
- A personal `.m3u` file can be imported in the browser, but the web build plays only HTTPS HLS links that allow direct browser playback. The imported list stays in the tab and disappears on reload. It is not added to the public guide or uploaded to OpenWave.
- Search by channel, place, language, and category remains. The optional MiniLM model is excluded from this web build to keep every Cloudflare Pages asset under 25 MiB; the web UI does not claim AI search. The desktop preview retains it.
- The Home Screen web app can reopen its cached shell and guide offline. Watching TV or listening to radio still needs a connection; live video/audio is never cached.

## Phone installation and testing

On an iPhone in India, open the HTTPS beta URL in Safari and choose **Share → Add to Home Screen**. This creates a Home Screen web app; it is not a native IPA download. On Android, open the HTTPS URL in Chrome and choose **Add to Home screen** or **Install app** when offered. Test a channel using both Wi-Fi and mobile data, then switch channels and return after closing the Home Screen app. If a feed fails, report the channel, phone model, browser/OS version, network type, and time through [GitHub Issues](https://github.com/jobinebanezer18/openwave-tv/issues). Do not post playlist URLs containing personal access tokens.

## Build locally

```sh
npm ci
npm run build:web
npx vite preview --host 127.0.0.1 --port 4174 --outDir dist-web
```

The build outputs `dist-web/` and checks every asset against Cloudflare Pages' 25 MiB per-file limit. For the desktop Go build, use `npm run build` instead; its `dist/` contains the separate local-server UI and optional AI runtime. Do not upload that desktop `dist/` as a static TV website, because its `/api/*` calls need Go.

## Beta gates still open

Root Chromium checks confirmed direct playback reaching readyState 4 for NDTV India, 9XM, DD Bharati, CNBC TV18, Aakaash Aath, and Gyandarshan. B4U Music was removed after it failed browser CORS despite passing a network-header probe. The hosted beta also played 9XM over HTTPS, and its cached shell and guide reopened offline with a connection notice. Physical iPhone Safari and Android Chrome playback, background audio, and Home Screen installation still need tests. This beta should be expanded or narrowed from those results, not from playlist size alone.
