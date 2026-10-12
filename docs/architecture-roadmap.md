# OpenWave cross-platform production architecture

Status: proposed plan, updated from the v0.2.0 repository audit on 12 October 2026. Owner decisions override earlier store-oriented and rights-gate assumptions: India first; public, free curated guide plus private user playlists; website/GitHub downloads for desktop and Android; iPhone via website Home Screen web app; no app stores; prefer free static hosting when technically viable. A checked milestone means its evidence has been recorded in the release checklist; shipping a binary alone does not satisfy it.

## Product and distribution contract

For the India community alpha, the public guide may include publicly accessible free streams when it records provenance, playback checks, known territory/access limits, and a working correction/takedown path. Written permission for each free stream is not an alpha prerequisite. This is an editorial and reliability baseline, not a guarantee of legal rights; use later source-use scrutiny for broader promotion or any changed distribution context. Keep paid, encrypted, DRM, disputed feeds, and protected artwork out unless separately authorized/reviewed. OTT services may be linked through official apps or websites where their terms permit. Private user playlists remain on the viewer's device and outside the public guide, its analytics, and its source review queue. Apple may request documentation for apps streaming third-party video, sports, audio, or using others' trademarks: [Apple review documentation](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review).

The user's install preference is outside app stores on ordinary devices. Use website/GitHub downloads for desktop and Android APK, and an HTTPS Home Screen web app from the website for iPhone in India: [Apple's user guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27). Native iOS distribution outside the App Store is region limited and requires Apple authorization and notarization; direct website installation of an app that is not a marketplace is limited to the EU under Apple's current rules: [Apple alternative distribution](https://developer.apple.com/support/apps-in-the-eu), [web distribution requirements](https://developer.apple.com/documentation/marketplacekit/distributing-your-app-from-your-website). Do not promise an India-installable iOS `.ipa` on ordinary iPhones. Native iOS packaging is out of scope unless the owner changes the target or Apple adds an India-eligible route. Do not use enterprise/ad hoc/jailbreak certificates as a public distribution workaround. Recheck regional rules before release.

Android direct APK distribution is viable, with an install-from-this-source step. Register the package and signing identity with Android Developer Console before the planned broader 2027 verification rollout; the current initial enforcement is limited by region and store: [Android developer verification](https://developer.android.com/developer-verification/guides). Distribute signed builds from a controlled HTTPS origin with checksums and update instructions, not an untraceable mirror.

## What exists and what blocks production

| Current implementation | Production consequence |
| --- | --- |
| Vite/vanilla JS UI in `src/`, compiled into a single Go binary via `//go:embed dist/*`; Go serves only on `127.0.0.1` and offers `/api/channels`, `/api/session`, `/api/private-session`, `/api/media` | Strong desktop prototype. The private M3U import stays in browser-tab memory and selected URLs go only to the local Go process. A static Home Screen web app cannot use that API without a replacement playback path. |
| Go downloads a checked channel index, merges Free-TV and World IPTV backup URLs, probes two recent HLS segments, rewrites manifests and proxies media on the user's machine | Helpful recovery, but probes are not evidence of stream rights, decoder compatibility, or sustained playback. The in-memory catalog/probe/dead/session maps reset on restart; refresh happens during a request. The local proxy needs request-origin, resource, lifetime, and network hardening before wider distribution. |
| Radio uses a bundled versioned station snapshot and a validated background refresh; audio plays directly in `<audio>` | Startup no longer depends on GitHub, but individual station reachability is still outside our control. Browser and Android playback need separate tested paths. |
| Favorites, recents, preferences, and temporary failures stored in browser `localStorage`; optional MiniLM runs in browser | No account or sync, which suits privacy. Native shells need a migration-safe storage contract. The AI download and model license/version must be pinned and disclosed. |
| CI cross-compiles five unsigned desktop archives and smoke-tests packaged startup on Linux, macOS, and Windows | No native mobile projects, installable hosted web app, signed/notarized desktop package, clean-device playback test, or rollback manifest yet. |
| Current catalog accepts third-party channel branding and stream links on index membership | Provenance, playback, known access limits, and correction/takedown records are missing. Index health alone does not establish these; protected artwork requires separate review. |

## Architecture decision

Keep one shared web UI and product/domain layer, with explicit catalog, playback, storage, and location adapters. Keep the Go local server as the desktop playback adapter. Use a hosted HTTPS Home Screen web app with a browser playback adapter for streams demonstrably playable directly in Safari/Chrome. Prototype an Android shell only after a device spike; Capacitor plus Media3/ExoPlayer is one candidate because Media3 handles HLS without browser CORS ([Android HLS](https://developer.android.com/media/media3/exoplayer/hls)). Do not build an India native iOS shell under the current outside-store rules. A mobile shell must never rely on a Go localhost server or on an unrestricted OpenWave media relay to make streams play.

The Home Screen web app is the iPhone route in India. Desktop starts with the existing executable, then gains a proper app window, installer, signing, and OS integration after a short Wails-versus-system-browser spike. The spike must validate video decoding, fullscreen, keyboard input, memory use, update flow, and accessibility on actual Windows/macOS machines before adopting a shell. Linux retains the self-contained browser launcher unless a tested native shell offers equivalent codec support.

Suggested seams, introduced without changing the design all at once:

```text
catalog adapters: validated signed snapshot -> live delta / Go API -> normalized Channel/Station
domain: source eligibility -> filter/rank/search -> selected media + recovery state
playback adapters: desktop Go proxy | iPhone/Android web HLS | Android Media3 candidate
storage adapters: versioned preferences/favorites/recents, export/import, local only by default
platform adapters: geolocation, deep links, install/update, share, accessibility
UI: common guide/player/onboarding/radio components, responsive layout and reduced-motion mode
```

Every player adapter must emit the same events (`resolving`, `buffering`, `playing`, `stalled`, `failed`, `ended`), normalized error causes (`network`, `HTTP`, `geo-restricted`, `codec`, `expired`, `policy`, `unknown`), and selected-source ID. The UI displays one clear recovery action and an alternative that passes the user's country/language preferences. The guide must distinguish *indexed*, *recently verified*, and *playing on this device*. Never label a feed "working" solely because an HLS manifest returned 200.

## Data, rights, and reliability pipeline

1. Maintain a machine-readable alpha source register with origin/provenance, public/free status, countries and known usage/access limits, artwork status, contact, last playback check, last review, and a removal flag. Filter paid, encrypted, disputed, and clearly restricted feeds. Track later source-use questions separately; the alpha does not require written permission for every free feed.
2. Build a compact, versioned catalog snapshot in CI from recorded sources. Validate JSON schema, stable IDs, HTTPS URLs, country/language codes, artwork URLs, duplicates, and metadata attribution. Publish the snapshot and hash on the planned static HTTPS host with a bundled last-known-good copy. Never execute playlist-provided code or use a channel title as HTML. Imported private playlists remain local and never enter this snapshot.
3. Run health sampling from multiple regions and actual device players, recording timestamp, probe method, startup outcome, duration, codec, and failure reason. Use a time-decaying confidence score, not a binary global "dead" state. A failed feed may be restricted by region or time. Probe only where source terms permit it; cap requests to avoid burdening broadcasters.
4. Rank curated alpha candidates by user locale and explicit interests, recent device success, recency of verification, expected codec, and source diversity. Do not advertise a raw number of upstream rows as playable inventory. Show the number of *eligible guide items under current filters*.
5. Use direct-to-publisher playback on mobile; desktop proxy remains local and tokenized. No OpenWave-operated video CDN/relay. Treat mobile streams requiring forbidden spoofed headers or unavailable rights as unsupported. This avoids hidden bandwidth bills and legal exposure.
6. Publish a privacy statement: location is optional and resolved on device, preferences are local by default, diagnostic upload is opt-in, and no stream URL or listening/viewing history is sent to analytics by default. Pin the radio dataset and AI model version, retain attribution in repository/legal notices, and verify redistribution terms.

## Milestones and acceptance gates

Estimates are engineer-weeks of focused work, not calendar commitments. Device access or platform approval waits can exceed them.

| Milestone | Work | Acceptance evidence | Rough effort |
| --- | --- | --- | --- |
| M0 — provenance and baselines | India public/free pilot cohort, source register, known access/territory notes, takedown contact, device matrix, failure taxonomy, documented privacy policy. | Every pilot item has provenance and playback evidence; clearly restricted/disputed items are excluded and correction/removal works. Current startup/playback baselines captured on supported devices. | 2–4 |
| M1 — stable shared core | Extract catalog, playback, preference, and platform contracts; version local data; move direct raw GitHub radio fetch behind catalog adapter; add deterministic fixtures. | Existing desktop flow passes unit/contract tests; migration keeps favorites and onboarding choices; browser refresh and network outage show explicit states. | 3–5 |
| M2 — desktop hardening | Background catalog refresh with last-known-good cache; bound sessions/maps/resource growth; origin/host checks for localhost API; responsive client; playback diagnostics; Windows/macOS smoke tests. | No open proxy or request to private network; a failed upstream index still opens cached guide; 30-minute playback does not grow memory unbounded; playback/fallback tested on representative HLS variants. | 3–5 |
| M3 — hosted PWA | HTTPS hosting, manifest/icons, offline app shell and saved guide, direct-browser playback adapter, install flow, accessible mobile layout. | Add to Home Screen works on current iPhone Safari and Chrome Android; shell and favorites open offline; live playback clearly says internet required; unsupported streams do not appear as playable in the web route. | 3–5 |
| M4 — Android app | Capacitor wrapper, native Media3 HLS/radio plugin, local catalog storage, location consent, signed APK, update/install page, Android developer/package registration. | Ordinary unrooted phone installs the APK outside Play; representative approved HLS and radio run for 30 minutes, resume after backgrounding as designed, switch and recover; release signature/hash verified on a second device. | 4–7 |
| M5 — production desktop app | Decide shell via measured spike, package Windows/macOS, sign Windows builds, Developer ID sign and notarize Mac builds, accessible OS integration and update flow. | Fresh Windows and macOS installations run without developer tooling; installer and updater verify signatures; uninstall leaves expected user data policy; 30-minute stream and suspend/resume pass. Apple [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) and Microsoft [SmartScreen/signing](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation) checks recorded. | 4–7 |
| M6 — native iOS decision | Deferred for India. Reopen only if the owner changes the target or Apple adds an India-eligible direct/marketplace route. | No India `.ipa` is advertised; verify Safari Home Screen installation and playback. If reopened, verify current eligibility, notarization, source-use review, and physical-device install before a native release. | Deferred |
| M7 — staged launch | Signed release manifest, checksums, SBOM, reproducible builds where possible, beta cohort, failure dashboards, support/takedown runbook, rollback drill. | 7-day pilot: at least 95% startup success and <8 s p95 first frame among the *approved reference feeds* in supported regions/networks; crash-free sessions ≥99.5%; source rights/takedown requests answered within stated SLA; rollback tested. Targets can be revised from M0 measured baseline before public promise. | 2–4 |

Launch order: M0 → M1/M2 → M3 and M4 in parallel → M5 → M7. M6 is deferred under the India/no-store decision. Release a curated, reliable catalog before marketing channel-count breadth.

## CI, operations, and release controls

- Pull requests: JS/Go unit and contract tests; source-schema and license checks; dependency/SBOM scan; UI keyboard and accessibility smoke tests; safe HLS fixtures with variants, nested manifests, `EXT-X-KEY`, redirects, ranges, stale/empty media, and IPv4/IPv6/private-network cases. No live third-party stream is a blocking CI fixture.
- Nightly: OS/device smoke matrix, approved live-feed sampling with rate limits, startup latency and decoder failure summaries, visual regression at phone/tablet/desktop widths and reduced-motion mode. Use anonymized test probes; no passive collection of viewers' history.
- Release: lock toolchains and dependencies; build signed artifacts from protected tags; publish checksum and provenance; verify on clean devices; staged rollout; retain last stable catalog and builds. Separate catalog rollback from binary rollback. Store signing secrets in CI's protected environment, never in source.
- Incident operations: health/provider outage notice, fast removal switch for unauthorized or unsafe feeds, abuse/takedown contact, security disclosure route, clear update path for sideloaded Android and desktop users. Recheck Apple and Android distribution requirements before each native release.

## First executable slice

Implement M1's adapter seam with **no visible redesign**: define a versioned `CatalogRepository` and `PlaybackController` interface, preserve the Go desktop API, replace the radio component's direct GitHub fetch with a bundled last-known-good catalog plus a refresh adapter, and add contract tests for malformed/expired catalogs and playback state transitions. Record current launch/start/switch metrics on one approved reference stream. This yields a reviewable PR and makes PWA/Android work possible without forcing an untested full rewrite.

The highest-risk blockers are content authorization, native iOS distribution eligibility, browser CORS/codec limits, and unreliable upstream streams. Resolve those with rights evidence and device tests, not UI copy or extra playlist sources.
