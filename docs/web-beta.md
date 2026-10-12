# Worldwide web beta, India first

**Live beta:** https://tv.vibeworks.in/

OpenWave's browser build starts with India and lets viewers switch to other countries in Preferences or Refine channels. **Watch** has **6,892 direct-stream candidates in 174 countries**. **All channels** has **29,756 active channel identities across 231 countries and regions**, including channels with no direct browser feed. India has **619 stream-linked channels within 1,460 indexed identities**. On 12 October 2026, a bounded manifest and first-child CORS check found 587 India entries with a candidate direct browser feed; 32 remaining entries failed that check or a follow-up Chromium playback check. Star Sports 2 Hindi was moved to the directory when its manifest returned 404. The default India Watch guide starts with those 587, while search still exposes failed entries for retry. These checks are point-in-time signals, not proof of continuous playback.

## Catalog and playback

- The [iptv-org channel, stream, and feed APIs](https://github.com/iptv-org/api) supply worldwide identities, direct HLS URLs, and available language metadata. The original 49 curated India entries retain their stable IDs and preferred sources. Country catalogs are separate files, so the app loads the selected country instead of downloading the whole world at startup. All channels shows identities without a stream and lets a viewer connect a personal HLS feed to a channel row.
- The web player requests HTTPS HLS directly from the stream host. A host can change or block a URL by region, browser, codec, time, or access policy. A basic network probe can pass while video fails; Star Sports 2 Telugu did exactly that when current media segments returned 404 during Chromium playback.
- The Sports filter loads a separate worldwide sports index on demand: 213 entries with stream links and 2,090 directory-only entries as of this snapshot. It shows stream-linked channels first, then India and requested languages within each group. DD Sports has a second verified manifest; N Sports and SportOutdoor.tv were added after their manifests and first media segments returned with browser CORS headers. Other catalog links are not equivalently verified.
- The saved [Sun NXT live snapshot](../catalog/sunnxt-live.v1.json) contains all 44 entries returned by Sun NXT's public live-list API on 12 October 2026, including broadcaster variants and third-party news channels. The generator matches existing OpenWave entries and adds missing identities; each has a channel-specific Sun NXT detail page in catalog metadata. Search and language filters include directory entries, so searching for Sun TV under Tamil reveals its channel row. A viewer can connect an accessible `.m3u8` source to that row and play it inside OpenWave. The URL is held only in memory for the tab; it is not uploaded, saved as a favorite URL, or published in the guide. Sun TV has no verified public direct feed in this snapshot. Refresh the snapshot with `node scripts/sync-sunnxt-catalog.mjs`, review the diff, then regenerate the world catalog.
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

The generator keeps the saved India browser-check snapshot in `catalog/india-browser-checks.v1.json`; fetching new upstream APIs does not make that check fresh. Before a later release, rerun real browser playback samples and replace stale check results. `npm run build:web` validates country and sports files and the hosting asset-size limit. The desktop Go build uses `npm run build` instead.

## Verification still needed

Chromium on macOS played NDTV India, 9XM, DD Bharati, CNBC TV18, Aakaash Aath, Gyandarshan, and DD National in local or hosted checks. The first hosted India beta also reopened its cached shell offline. The expanded worldwide guide still needs representative first-frame tests by country, physical iPhone Safari and Android Chrome playback, Home Screen install, background audio, and longer stream reliability runs. The index count must never be presented as a count of guaranteed live channels.
