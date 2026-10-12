# OpenWave cross-platform production architecture

Status: proposed plan, based on the v0.2.0 repository audit on 12 October 2026. A checked milestone means its evidence has been recorded in the release checklist; shipping a binary alone does not satisfy it.

## Product and distribution contract

OpenWave is a free, open-source guide and player for authorized public live TV and internet radio. It does not have rights to restream Netflix, Hulu, Disney+ Hotstar, paid sports, or other subscription catalogs. OTT services can be linked through their official apps or websites when their linking terms permit it; they cannot be silently played through OpenWave. A playlist URL being public or listed on GitHub does not establish playback or distribution rights. An approved-source register, owner contact, territory, permitted use, artwork permission, and removal path are release prerequisites, particularly for native iOS. Apple may request documentation for apps streaming third-party video, sports, audio, or using others' trademarks: [Apple review documentation](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review).

The user's install preference is outside app stores on ordinary devices. This can be met globally on desktop and through an Android APK. On iPhone, a hosted Home Screen web app is the global first route: [Apple's user guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27). Native iOS distribution outside the App Store is region limited and requires Apple authorization and notarization; direct website installation of an app that is not a marketplace is limited to the EU under Apple's current rules: [Apple alternative distribution](https://developer.apple.com/support/apps-in-the-eu), [web distribution requirements](https://developer.apple.com/documentation/marketplacekit/distributing-your-app-from-your-website). Do not promise a universally sideloadable iOS `.ipa` on ordinary iPhones. If native iOS eligibility or content rights are not established, keep iOS at the web-app route and do not use enterprise/ad hoc/jailbreak certificates as a public distribution workaround. Recheck regional rules before release.

Android direct APK distribution is viable, with an install-from-this-source step. Register the package and signing identity with Android Developer Console before the planned broader 2027 verification rollout; the current initial enforcement is limited by region and store: [Android developer verification](https://developer.android.com/developer-verification/guides). Distribute signed builds from a controlled HTTPS origin with checksums and update instructions, not an untraceable mirror.

## What exists and what blocks production

| Current implementation | Production consequence |
| --- | --- |
| Vite/vanilla JS UI in `src/`, compiled into a single Go binary via `//go:embed dist/*`; Go serves only on `127.0.0.1` and offers `/api/channels`, `/api/session`, `/api/media` | Strong desktop prototype. A static PWA or WebView cannot use the current API without a host process or replacement adapter. |
| Go downloads a checked channel index, merges Free-TV and World IPTV backup URLs, probes two recent HLS segments, rewrites manifests and proxies media on the user's machine | Helpful recovery, but probes are not evidence of stream rights, decoder compatibility, or sustained playback. The in-memory catalog/probe/dead/session maps reset on restart; refresh happens during a request. The local proxy needs request-origin, resource, lifetime, and network hardening before wider distribution. |
| Radio JSON fetched in the browser from a third-party GitHub raw URL and played directly in `<audio>` | Availability and schema are outside our control. Browser playback and native playback need separate tested paths; keep a versioned catalog snapshot and fallback. |
| Favorites, recents, preferences, and temporary failures stored in browser `localStorage`; optional MiniLM runs in browser | No account or sync, which suits privacy. Native shells need a migration-safe storage contract. The AI download and model license/version must be pinned and disclosed. |
| CI runs on Ubuntu, cross-compiles unsigned Go archives for five desktop targets, publishes tags | No native mobile projects, no installable PWA, no signed/notarized desktop package, no Windows/macOS runtime smoke test, no rollback manifest. |
| Current catalog accepts third-party channel branding and stream links on index membership | An approved-source and artwork-rights gate is missing. Index health is not editorial, geographic, or rights clearance. |

## Architecture decision

Keep one shared web UI and product/domain layer, with explicit catalog, playback, storage, and location adapters. Keep the Go local server as the desktop playback adapter. Use a hosted HTTPS PWA with a browser playback adapter for streams demonstrably playable directly in Safari/Chrome. Build Android and iOS shells with Capacitor and small native playback plugins: Media3/ExoPlayer on Android and AVPlayer on iOS. These players handle HLS and request headers without a browser CORS dependency, subject to publisher permission and platform network policy ([Android HLS](https://developer.android.com/media/media3/exoplayer/hls), [Apple HLS](https://developer.apple.com/documentation/http-live-streaming)). A mobile shell must never rely on a Go localhost server or on a remote OpenWave media relay to make unlicensed streams play.

The PWA is the installable iPhone route; a native iOS shell is a later gated route for approved regions. Desktop starts with the existing executable, then gains a proper app window, installer, signing, and OS integration after a short Wails-versus-system-browser spike. The spike must validate video decoding, fullscreen, keyboard input, memory use, update flow, and accessibility on actual Windows/macOS machines before adopting a shell. Linux retains the self-contained browser launcher unless a tested native shell offers equivalent codec support.

Suggested seams, introduced without changing the design all at once:

```text
catalog adapters: validated signed snapshot -> live delta / Go API -> normalized Channel/Station
domain: source eligibility -> filter/rank/search -> selected media + recovery state
playback adapters: desktop Go proxy | PWA browser HLS | Android Media3 | iOS AVPlayer
storage adapters: versioned preferences/favorites/recents, export/import, local only by default
platform adapters: geolocation, deep links, install/update, share, accessibility
UI: common guide/player/onboarding/radio components, responsive layout and reduced-motion mode
```

Every player adapter must emit the same events (`resolving`, `buffering`, `playing`, `stalled`, `failed`, `ended`), normalized error causes (`network`, `HTTP`, `geo-restricted`, `codec`, `expired`, `policy`, `unknown`), and selected-source ID. The UI displays one clear recovery action and an alternative that passes the user's country/language preferences. The guide must distinguish *indexed*, *recently verified*, and *playing on this device*. Never label a feed "working" solely because an HLS manifest returned 200.

## Data, rights, and reliability pipeline

1. Maintain a machine-readable source register. Each provider has origin, metadata license, stream authorization evidence, countries, usage constraints, logo permission, contact, last review date, and a removal flag. Launchable records require an approved entry. Filter paid, encrypted, suspicious, and unresolved sports/movie feeds from production builds. The first approved cohort can be small and excellent.
2. Build and sign a compact, versioned catalog snapshot in CI from approved sources. Validate JSON schema, stable IDs, HTTPS URLs, country/language codes, artwork URLs, duplicates, and metadata license. Publish the snapshot and hash on a controlled HTTPS endpoint with a bundled last-known-good copy. Never execute playlist-provided code or use a channel title as HTML.
3. Run health sampling from multiple regions and actual device players, recording timestamp, probe method, startup outcome, duration, codec, and failure reason. Use a time-decaying confidence score, not a binary global "dead" state. A failed feed may be restricted by region or time. Probe only where source terms permit it; cap requests to avoid burdening broadcasters.
4. Rank approved candidates by user locale and explicit interests, recent device success, recency of verification, expected codec, and source diversity. Do not advertise a raw number of upstream rows as playable inventory. Show the number of *eligible guide items under current filters*.
5. Use direct-to-publisher playback on mobile; desktop proxy remains local and tokenized. No OpenWave-operated video CDN/relay. Treat mobile streams requiring forbidden spoofed headers or unavailable rights as unsupported. This avoids hidden bandwidth bills and legal exposure.
6. Publish a privacy statement: location is optional and resolved on device, preferences are local by default, diagnostic upload is opt-in, and no stream URL or listening/viewing history is sent to analytics by default. Pin the radio dataset and AI model version, retain attribution in repository/legal notices, and verify redistribution terms.

## Milestones and acceptance gates

Estimates are engineer-weeks of focused work, not calendar commitments. A rights or platform approval wait can exceed them.

| Milestone | Work | Acceptance evidence | Rough effort |
| --- | --- | --- | --- |
| M0 — rights and baselines | Source/brand review, approved pilot cohort, license ledger, takedown address, device matrix, failure taxonomy, documented privacy policy. | Every pilot item has an authorized source record; an unapproved item cannot enter the release snapshot. Current app startup/playback baselines captured on three desktop OSes and two phone OSes. | 2–4 |
| M1 — stable shared core | Extract catalog, playback, preference, and platform contracts; version local data; move direct raw GitHub radio fetch behind catalog adapter; add deterministic fixtures. | Existing desktop flow passes unit/contract tests; migration keeps favorites and onboarding choices; browser refresh and network outage show explicit states. | 3–5 |
| M2 — desktop hardening | Background catalog refresh with last-known-good cache; bound sessions/maps/resource growth; origin/host checks for localhost API; responsive client; playback diagnostics; Windows/macOS smoke tests. | No open proxy or request to private network; a failed upstream index still opens cached guide; 30-minute playback does not grow memory unbounded; playback/fallback tested on representative HLS variants. | 3–5 |
| M3 — hosted PWA | HTTPS hosting, manifest/icons, offline app shell and saved guide, direct-browser playback adapter, install flow, accessible mobile layout. | Add to Home Screen works on current iPhone Safari and Chrome Android; shell and favorites open offline; live playback clearly says internet required; unsupported streams do not appear as playable in the web route. | 3–5 |
| M4 — Android app | Capacitor wrapper, native Media3 HLS/radio plugin, local catalog storage, location consent, signed APK, update/install page, Android developer/package registration. | Ordinary unrooted phone installs the APK outside Play; representative approved HLS and radio run for 30 minutes, resume after backgrounding as designed, switch and recover; release signature/hash verified on a second device. | 4–7 |
| M5 — production desktop app | Decide shell via measured spike, package Windows/macOS, sign Windows builds, Developer ID sign and notarize Mac builds, accessible OS integration and update flow. | Fresh Windows and macOS installations run without developer tooling; installer and updater verify signatures; uninstall leaves expected user data policy; 30-minute stream and suspend/resume pass. Apple [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) and Microsoft [SmartScreen/signing](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation) checks recorded. | 4–7 |
| M6 — native iOS decision | Confirm permitted territories, Apple developer/distribution eligibility, approved catalog rights, then prototype AVPlayer and packaging. | If eligible, notarized native app is installed on an ordinary supported iPhone through authorized regional distribution and passes playback/QA. Otherwise, explicitly close native route and ship the iOS PWA; do not portray a demo-signed `.ipa` as a public release. | 4–8 plus approval |
| M7 — staged launch | Signed release manifest, checksums, SBOM, reproducible builds where possible, beta cohort, failure dashboards, support/takedown runbook, rollback drill. | 7-day pilot: at least 95% startup success and <8 s p95 first frame among the *approved reference feeds* in supported regions/networks; crash-free sessions ≥99.5%; source rights/takedown requests answered within stated SLA; rollback tested. Targets can be revised from M0 measured baseline before public promise. | 2–4 |

Launch order: M0 → M1/M2 → M3 and M4 in parallel → M5 → M6 only if authorized → M7. Do not hold the global iPhone web release for native iOS eligibility. Release a curated, reliable catalog before marketing channel-count breadth.

## CI, operations, and release controls

- Pull requests: JS/Go unit and contract tests; source-schema and license checks; dependency/SBOM scan; UI keyboard and accessibility smoke tests; safe HLS fixtures with variants, nested manifests, `EXT-X-KEY`, redirects, ranges, stale/empty media, and IPv4/IPv6/private-network cases. No live third-party stream is a blocking CI fixture.
- Nightly: OS/device smoke matrix, approved live-feed sampling with rate limits, startup latency and decoder failure summaries, visual regression at phone/tablet/desktop widths and reduced-motion mode. Use anonymized test probes; no passive collection of viewers' history.
- Release: lock toolchains and dependencies; build signed artifacts from protected tags; publish checksum and provenance; verify on clean devices; staged rollout; retain last stable catalog and builds. Separate catalog rollback from binary rollback. Store signing secrets in CI's protected environment, never in source.
- Incident operations: health/provider outage notice, fast removal switch for unauthorized or unsafe feeds, abuse/takedown contact, security disclosure route, clear update path for sideloaded Android and desktop users. Recheck Apple and Android distribution requirements before each native release.

## First executable slice

Implement M1's adapter seam with **no visible redesign**: define a versioned `CatalogRepository` and `PlaybackController` interface, preserve the Go desktop API, replace the radio component's direct GitHub fetch with a bundled last-known-good catalog plus a refresh adapter, and add contract tests for malformed/expired catalogs and playback state transitions. Record current launch/start/switch metrics on one approved reference stream. This yields a reviewable PR and makes PWA/Android work possible without forcing an untested full rewrite.

The highest-risk blockers are content authorization, native iOS distribution eligibility, browser CORS/codec limits, and unreliable upstream streams. Resolve those with rights evidence and device tests, not UI copy or extra playlist sources.
