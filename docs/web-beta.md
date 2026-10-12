# Worldwide web beta, India first

**Live beta:** https://openwave-world-beta.pages.dev/

OpenWave's browser build starts with India and lets viewers switch to other countries in Preferences or Refine channels. **Watch** has **6,891 direct-stream candidates in 174 countries**. **All channels** has **29,742 active channel identities across 231 countries and regions**, including channels with no direct browser feed. India has **620 stream-linked channels within 1,447 indexed identities**. On 12 October 2026, a bounded manifest and first-child CORS check found 587 India entries with a candidate direct browser feed; 33 failed that check or a follow-up Chromium playback check. The default India Watch guide starts with those 587, while search still exposes failed entries for retry. These checks are point-in-time signals, not proof of continuous playback or media rights.

## Catalog and playback

- The [iptv-org channel, stream, and feed APIs](https://github.com/iptv-org/api) supply worldwide identities, direct HLS URLs, and available language metadata. The original 49 curated India entries retain their stable IDs and preferred sources. Country catalogs are separate files, so the app loads the selected country instead of downloading the whole world at startup. All channels shows identities without a stream and offers the official broadcaster site when a safe HTTPS link is listed.
- The web player requests HTTPS HLS directly from the stream host. A host can change or block a URL by region, browser, codec, time, or access policy. A basic network probe can pass while video fails; Star Sports 2 Telugu did exactly that when current media segments returned 404 during Chromium playback.
- Radio uses direct station audio and the bundled station guide. A personal `.m3u` file stays in the browser tab and can play only direct HTTPS HLS sources that allow browser access. Private imports are not added to the public guide or uploaded to OpenWave.
- Search by channel, country, language, and category remains. The optional MiniLM model is excluded from the web build to keep assets small; the web UI does not claim AI search. The desktop preview retains the optional local model.
- The Home Screen app can reopen its cached shell and selected country guide offline. Watching TV or listening to radio still needs a connection; live media is never cached.

## Install on a phone

On iPhone, open the HTTPS beta URL in Safari and choose **Share → Add to Home Screen**. On Android, open it in Chrome and choose **Add to Home screen** or **Install app** when offered. Report a failed channel with its name, country, phone model, browser/OS version, network type, and time in [GitHub Issues](https://github.com/jobinebanezer18/openwave-tv/issues). Do not post private playlist URLs containing access tokens.

## Build and update the snapshot

```sh
npm ci
curl -fsSL https://iptv-org.github.io/api/channels.json -o work/catalog/iptv-org-channels.json
curl -fsSL https://iptv-org.github.io/api/streams.json -o work/catalog/iptv-org-streams.json
curl -fsSL https://iptv-org.github.io/api/feeds.json -o work/catalog/iptv-org-feeds.json
node scripts/generate-world-catalog.mjs
npm run build:web
```

The generator keeps the saved India browser-check snapshot in `catalog/india-browser-checks.v1.json`; fetching new upstream APIs does not make that check fresh. Before a later release, rerun real browser playback samples and replace stale check results. `npm run build:web` validates country files and the hosting asset-size limit. The desktop Go build uses `npm run build` instead.

## Verification still needed

Chromium on macOS played NDTV India, 9XM, DD Bharati, CNBC TV18, Aakaash Aath, Gyandarshan, and DD National in local or hosted checks. The first hosted India beta also reopened its cached shell offline. The expanded worldwide guide still needs representative first-frame tests by country, physical iPhone Safari and Android Chrome playback, Home Screen install, background audio, and longer stream reliability runs. The index count must never be presented as a count of guaranteed live channels.
