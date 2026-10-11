# OpenWave TV

A local, open-source TV guide that plays public live streams in your browser. No VLC setup, account, or API key is needed.

## Download and watch

Download the executable for your computer from [Releases](https://github.com/jobinebanezer18/openwave-tv/releases), unzip it, and run it. OpenWave starts a local server and opens your browser. The server binds to `127.0.0.1`; it does not expose the player to your network. Keep the program running while you watch.

An internet connection is needed for the guide and streams. The optional AI model downloads on first use and is cached by the browser. The model runs on your computer; search text is not sent to an AI service.

## What it does

- Plays HLS streams in Chrome, Edge, Firefox, or Safari using [hls.js](https://github.com/video-dev/hls.js) or native HLS support.
- Shows only feeds recently marked online by [IPTV Nexus](https://github.com/dearbulut/iptv), which builds on [iptv-org](https://github.com/iptv-org/iptv).
- Checks a playlist and a media segment locally before opening a feed, then tries another source when one exists.
- Filters by country, language, and category. Favorites are kept in your browser.
- Uses an optional on-device [MiniLM model](https://huggingface.co/Xenova/all-MiniLM-L6-v2) to interpret ambiguous search phrases. Names, countries, languages, and common categories work without loading the model.

## Run from source

Install Go 1.22+ and Node.js 20+, then:

```sh
npm ci
npm run build
go run .
```

OpenWave prints its local URL. To use a fixed port without opening a browser automatically:

```sh
go run . -no-browser -addr 127.0.0.1:8765
```

For interface development, run `go run . -no-browser -addr 127.0.0.1:8765` and `npm run dev` in separate terminals. Vite proxies `/api` to the Go server.

## How playback works

The Go process downloads channel metadata, serves the interface, and proxies HLS playlists and segments to the browser. This allows playback of feeds that require request headers or do not permit cross-origin browser requests. A media session is created only for an indexed channel; the proxy does not accept arbitrary URLs. The app does not record, store, or rebroadcast video.

Stream health is temporary. A broadcaster may remove a link, block a region, change format, or require rights that this app cannot supply. A health check confirms that a playlist and segment respond; it cannot guarantee continuous playback or codec support. The guide refreshes from the index every 12 hours while the app is running.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome for playback failures, accessibility, UI improvements, translations, and catalog quality. Please include a channel name, country, browser, and error details for playback reports. Do not submit links to paid, encrypted, or unauthorized streams.

## Credits and license

OpenWave TV code is MIT licensed. Channel metadata and stream links come from independent projects and broadcasters; their own terms apply. [iptv-org](https://github.com/iptv-org/iptv) supplies the base catalog, [IPTV Nexus](https://github.com/dearbulut/iptv) supplies recent health status, and the on-device AI model is [Apache 2.0 licensed](https://huggingface.co/Xenova/all-MiniLM-L6-v2). OpenWave is not affiliated with broadcasters or those projects.
