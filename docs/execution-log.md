# Launch program execution log

Date: 12 October 2026. This records verified work against the [launch plan](launch-plan.md). It is not a claim that any platform has passed its public release gate.

## Completed in the first execution slice

| Workstream | Implemented | Evidence |
| --- | --- | --- |
| Independent planning | Three separate platform, architecture, and quality plans; a fourth audit reconciled contradictions and set a first slice. | [Platform](platform-distribution.md), [architecture](architecture-roadmap.md), [quality](launch-quality.md), [plan audit](plan-audit.md). |
| Local API boundary | Loopback bind and Host checks; same-origin POST checks; bounded JSON; bounded probes, sessions, probe cache, and rolling HLS URL window. | `main.go`, `main_test.go`; hostile Host/Origin and malformed request tests; packaged local HTTP checks. |
| Radio startup | Versioned bundled station snapshot and last-valid cache; background refresh with validation and throttle; existing radio UI and country preference retained. | `src/radio-catalog.js`, `src/radio-catalog.test.js`, `public/radio/stations.v1.json`; browser check showed 150 India stations without waiting for GitHub. |
| Source review foundation | A versioned review queue and validator. Every current candidate is deliberately unreviewed; `--production` fails until genuine rights evidence is entered. | `catalog/rights-register.json`, `scripts/validate-rights-register.mjs`, focused gate tests. This register is not yet wired into the running catalog. |
| Release verification | CI builds five unsigned archives, writes checksums, tests executable startup on Linux/macOS/Windows runners, and publishes tag builds only after smoke jobs pass. | `.github/workflows/build.yml`, `scripts/smoke-release.go`; local macOS packaged smoke passed. Target-runner CI status is recorded below. |
| Integration review | Found and fixed Vite development POST rejection introduced by the tighter Origin rule. Corrected radio name escaping and made its large count match the country-filtered guide. | Local proxy POST returned 404 for a valid-origin unknown ID and 403 for a hostile Origin; browser showed `150 STATIONS TO EXPLORE` and a station name containing an apostrophe correctly. |
| Privacy and stable preferences | Published an actual network/data map, corrected UI copy that overstated location and preference isolation, and changed the default launcher to fixed `127.0.0.1:8765`. | [Privacy notice](privacy.md), browser copy review, Go startup test. Multi-instance and old random-port migration remain open. |
| Picker accessibility | TV and radio place pickers now keep keyboard focus inside, make the background inert, expose expanded and pressed states, return focus on close, and use larger targets. | Isolated Chromium keyboard smoke: ArrowDown changed the roving Tab stop, Tab wrapped to Back, Escape returned to the trigger, and background inert state cleared for both pickers. Screen-reader and device testing remain open. |

## Verification status

- JavaScript search/radio tests: **9 passed**. Rights-register tests: **5 passed**. Production web build completed.
- Go tests, race tests, vet, and diff whitespace checks passed locally.
- Local packaged macOS arm64 smoke verified archive hash, loopback startup, HTML, favicon, and embedded JS asset.
- Local browser test verified first-run preferences and bundled radio catalog on the development server.
- Local keyboard browser test verified TV and radio picker focus containment, roving Tab stop, Escape recovery, and trigger state.
- First changed-workflow run: Linux and Windows packaged smoke passed; the macOS runner failed before smoke execution because the CI-selected Go 1.22 toolchain's `go run` binary lacked an `LC_UUID` load command required by that runner. CI was pinned to [Go 1.27.2](https://go.dev/doc/devel/release). The [rerun at commit `75fca3b`](https://github.com/jobinebanezer18/openwave-tv/actions/runs/38207332599) passed packaged startup and checksum checks on Linux, macOS, and Windows. These were runner smoke tests, not signed clean-device installs.
- The default desktop port is now fixed at `127.0.0.1:8765` so browser preferences and favorites persist across normal restarts. Port collisions fail explicitly; multi-instance handling remains a later desktop lifecycle task.
- Physical iOS/Android playback, direct APK install, signed desktop install/update, source-use review, multi-region stream reliability, screen-reader accessibility audit: **not yet performed**.
- The India web beta is deployed at https://openwave-india-beta.pages.dev/ on Cloudflare Pages Free. The browser-only `build:web` excludes the optional ONNX AI runtime, uses direct HTTPS HLS, and passes the 25 MiB per-file asset gate. Chromium playback reached ready state for NDTV India, 9XM, DD Bharati, CNBC TV18, Aakaash Aath, and Gyandarshan; hosted 9XM playback and offline shell reopening were also checked. B4U Music was removed after browser CORS failure. The guide contains 49 candidate channels; physical-phone validation remains open. See [web beta](web-beta.md) and the [distribution addendum](platform-distribution.md).

## What is still blocked from a production claim

The rights register is a guardrail, not proof of permission. The current app still indexes a broad upstream catalog and has no approved production cohort. The radio snapshot contains directory metadata and is not a curated station rights list. A phone PWA needs an HTTPS origin and a media path that works without the desktop Go process. No native mobile package or signed desktop installer exists. Platform-specific launch gates in the plan remain open.

## Next measured slice

India is the first launch country. Assign a catalog maintainer, build a small curated free-stream snapshot with provenance and playback results, and test first-frame and 10-minute playback on physical iPhone and Android over two networks. Use those measurements to decide whether direct browser playback is sufficient for the web app and whether a native Android player is needed. In parallel, complete signed desktop packaging once owner signing identities are available.

## India-first personal-playlist slice

Owner direction: India first, curated public free streams plus local personal playlists, no app-store listing, and pragmatic community source records. The plans now distinguish desktop/Android direct downloads from the iPhone India Home Screen web route. The owner asked to use Luna on suitable bounded work; a Luna agent audited plan consistency.

- Added a bounded, session-only M3U file parser and a separate searchable private guide. Imported URLs are held in page memory, do not enter favorites/recents or the public guide, and country/language preferences do not hide imported rows. Removing the import stops active private playback. Unsupported formats are skipped or rejected with a readable message.
- Added `POST /api/private-session` behind the local Host/Origin boundary. It accepts one public HTTP(S) HLS URL, validates the manifest and media, and returns the existing local media-session shape. Local/private-network targets are rejected and token-bearing URLs are not logged or returned in the JSON response.
- Integrated browser check: imported Apple's public HLS developer test stream from a selected M3U file, received a local media session, reached `readyState=4` with advancing playback and no player error, then removed the file and confirmed playback stopped and the guide cleared. This verifies the local desktop path; it does not establish live-TV or mobile compatibility.
- The personal-playlist file and URLs are not automatically stored. A reload requires reimport. The Go process can retain a previously created playback URL in session memory for up to four hours; [privacy notice](privacy.md) states this limit.

The web build supports private `.m3u` import locally in the browser and direct playback for HTTPS HLS feeds that permit browser access. Physical iPhone/Android playback and Home Screen install/offline tests remain open, as do Android APK release gates. The source-review policy for the community alpha is provenance, actual playback, known territory/access notes, and a removal path; it does not demand a written grant for every public free stream before engineering tests.

The [v0.3.0-alpha.1 GitHub prerelease](https://github.com/jobinebanezer18/openwave-tv/releases/tag/v0.3.0-alpha.1) packages this desktop slice as unsigned Windows, macOS, and Linux archives with SHA-256 checksums and an explicit preview notice. The tagged [CI run](https://github.com/jobinebanezer18/openwave-tv/actions/runs/38214030711) passed packaged startup checks on all three operating systems. These are direct GitHub downloads, not store submissions or signed consumer installers.
