# OpenWave TV

A local, open-source TV and radio guide that plays public live streams in your browser. No VLC setup, account, or API key is needed.

**Release status:** Current downloads are unsigned technical previews. The public catalog includes third-party links and has not passed the [production source review](catalog/README.md). See the [cross-platform launch plan](docs/launch-plan.md) and its [independent quality audit](docs/launch-quality.md) before treating a build as a consumer release.

## Download and watch

Download the executable for your computer from [Releases](https://github.com/jobinebanezer18/openwave-tv/releases), unzip it, and run it. On macOS 12+, the universal preview DMG contains an app you can drag to Applications. It opens its own TV window and starts a loopback-only local server; if the usual port is occupied, it tries another local port. The DMG is ad-hoc signed and not notarized, so macOS may require Control-click → Open on first launch. After installing an updater-enabled build once, the Mac app checks a signed update feed at `tv.vibeworks.in` and can install later releases in the app. Click **Updates** to check now or change automatic check and install settings. Use **Quit app** in the guide when finished. The standalone command-line builds open your default browser.

For Android, download the signed APK from [Get apps](https://tv.vibeworks.in/downloads/) and allow your browser to install it when Android asks. The Android app loads the hosted guide, so web UI and station catalog changes arrive when it reopens. A change to the Android shell itself needs a new APK signed by the same key and Android will ask you to approve that installation.

For Windows, the portable web-app EXE from [Get apps](https://tv.vibeworks.in/downloads/) opens the hosted guide in an Edge app window, with a default-browser fallback. Website changes arrive on refresh or relaunch. The separate Windows ZIP in Releases contains the local playback engine and opens your browser; changes to that engine require a new EXE.

An internet connection is needed for live streams. The Mac app can download an optional AI model on first use and run it locally; the web version searches names, places, languages, and categories without that model.

## Install on iPhone

Open [tv.vibeworks.in](https://tv.vibeworks.in/) in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App** if shown, and tap **Add**. This installs the Home Screen web app without an App Store account. Future web releases arrive through the site and service worker; when a new version takes control, the app offers a **Refresh** button so playback is not interrupted. The iPhone version plays direct HTTPS streams supported by Safari, so some channels that use the Mac app's local playback helper may be unavailable.

## What it does

- Plays HLS streams in Chrome, Edge, Firefox, or Safari using [hls.js](https://github.com/video-dev/hls.js) or native HLS support.
- Starts with a two-step choice of country, language, and interests; the channel guide then opens with matching channels. Preferences and favorites are saved in your browser.
- Shows feeds recently marked online by [IPTV Nexus](https://github.com/dearbulut/iptv), which builds on [iptv-org](https://github.com/iptv-org/iptv). Matching streams from [Free-TV](https://github.com/Free-TV/IPTV) and [World IPTV](https://github.com/Romaxa55/world_ip_tv) may provide alternate sources.
- Checks HLS playlists and the newest media segments locally before opening a feed. Empty transport packets are rejected. A failed channel is removed from the default guide for 30 minutes and a similar channel is suggested.
- Filters TV by country, language, and category. Selecting a channel brings the player into view.
- Imports a personal channel-list `.m3u` file into a separate guide for this browser tab. Public HTTP(S) HLS streams can play through the local Go process; private-network addresses, non-HLS formats, and URL-embedded usernames/passwords are rejected. Reloading clears the imported list, and imported URLs are not added to favorites or recents.
- Offers internet radio by country, city, and genre, with saved stations and an FM-frequency filter when station metadata provides a frequency. A bundled station guide opens immediately and refreshes from its source in the background. Optional location matching happens on your device against a bundled city index; coordinates are not sent to a geocoding service.
- Uses an optional on-device [MiniLM model](https://huggingface.co/Xenova/all-MiniLM-L6-v2) to interpret ambiguous search phrases. Names, countries, languages, and common categories work without loading the model.

## Run from source

Install Go 1.27.2 (the tested release toolchain) and Node.js 20+, then:

```sh
npm ci
npm run build
go run .
```

OpenWave prints its local URL. By default it uses `127.0.0.1:8765` so browser favorites and preferences remain on the same origin across launches. If another process already uses that port, close it before starting OpenWave. To run without opening a browser automatically:

```sh
go run . -no-browser -addr 127.0.0.1:8765
```

For interface development, run `go run . -no-browser -addr 127.0.0.1:8765` and `npm run dev` in separate terminals. Vite proxies `/api` to the Go server.

## Worldwide web beta, India first

The [worldwide web beta](https://openwave-world-beta.pages.dev/) starts with India. **Watch** indexes 6,891 direct-stream candidates in 174 countries. **All channels** includes 29,742 active channel identities across 231 countries and regions, with an official-site link where the source supplies a usable one. India has 620 stream-linked channels among 1,447 indexed identities; 587 passed a limited browser-origin check and appear in the default Watch guide. These are candidate links, not guaranteed live channels. The web build plays direct HTTPS HLS without the Go server; it does not relay video or include the desktop AI runtime. See [web beta notes](docs/web-beta.md) for installation, build, and testing limits.

## How playback works

The Go process downloads channel metadata, serves the interface, and proxies HLS playlists and segments to the browser. This allows playback of feeds that require request headers or do not permit cross-origin browser requests. A media session is created only for an indexed channel; the proxy does not accept arbitrary URLs. The app does not record, store, or rebroadcast video.

Stream health is temporary. A broadcaster may remove a link, block a region, change format, or require rights that this app cannot supply. A health check confirms that recent segments contain media; it cannot guarantee continuous playback or codec support. The guide refreshes from the index every 12 hours while the app is running. The UI count reflects the current filtered guide, not the size of the upstream index.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome for playback failures, accessibility, UI improvements, translations, and catalog quality. Please include a channel name, country, browser, and error details for playback reports. Do not submit links to paid, encrypted, or unauthorized streams.

## Privacy

The current app has no account or app-operated analytics. See [Privacy and network activity](docs/privacy.md) for the requests made to catalogs, media hosts, logo hosts, and the optional AI model, plus local storage and data-clearing details.

## Credits and license

OpenWave TV code is MIT licensed. Channel metadata and stream links come from independent projects and broadcasters; their own terms apply. [iptv-org](https://github.com/iptv-org/iptv) supplies the base catalog, [IPTV Nexus](https://github.com/dearbulut/iptv) supplies recent health status, and [Free-TV](https://github.com/Free-TV/IPTV) and [World IPTV](https://github.com/Romaxa55/world_ip_tv) supply possible alternate public streams. Radio metadata comes from [Verified Radio Streams](https://github.com/eyalev/verified-radio-streams) under CC0. The bundled city index is derived from [GeoNames cities15000](https://www.geonames.org/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The on-device AI model is [Apache 2.0 licensed](https://huggingface.co/Xenova/all-MiniLM-L6-v2). OpenWave is not affiliated with broadcasters or those projects.
