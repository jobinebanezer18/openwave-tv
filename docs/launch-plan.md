# OpenWave production launch program

**Working plan · 12 October 2026.** OpenWave v0.2.0 is a public desktop technical preview, not a signed consumer release. This plan covers iPhone/iPad, Android, macOS, Windows, and Linux on ordinary devices, with distribution outside app stores where a platform permits it. The supporting [distribution plan](platform-distribution.md), [architecture roadmap](architecture-roadmap.md), [quality audit](launch-quality.md), and [plan audit](plan-audit.md) contain detailed evidence and links to current platform rules.

## Launch contract

The product is a free, open-source guide and player for authorized public live TV and internet radio. Its first promise is **find a relevant feed and see or hear it play reliably**. Channel count, animation, AI search, and native packaging are secondary to that promise. No paid OTT catalog or third-party sports stream enters the production guide without an authorized integration. “AI” means optional local category inference; ordinary name/place/language search must work without a model download.

The desktop app can keep a user-local Go server. The worldwide iPhone product is an HTTPS Home Screen web app with a catalog proven to play in Safari without the current desktop-only localhost proxy. Android can additionally ship a signed direct-download APK after the media adapter and identity gates pass. Native iOS outside Apple's store is conditional and regional, not a global launch dependency. See the [platform distribution plan](platform-distribution.md) for the current permitted routes.

## Program ownership

| Workstream | Accountable role | Deliverables |
| --- | --- | --- |
| Product and design | Product owner | Final name, supported countries, onboarding and recovery flows, accessibility sign-off, launch copy. |
| Content and rights | Content owner with qualified legal review | Per-feed and artwork evidence, territory policy, takedown contact, approved pilot cohort. |
| Core engineering | Maintainer | Versioned catalog, adapters, playback state machine, source health, privacy boundaries, deterministic tests. |
| Platform engineering | Maintainer plus platform testers | Signed desktop packages, Android APK, PWA, conditional iOS native spike, install/update/uninstall evidence. |
| Operations | Release owner | Protected release process, checksums/SBOM, staged rollout, metrics, incident and rollback runbook. |

One person may fill several roles, but each gate needs named sign-off. If a role is unfilled, label the candidate preview rather than silently skipping its review.

## The architecture decision we must prove

The current frontend calls `/api/channels`, `/api/session`, and `/api/media`; the Go server proxies HLS on `127.0.0.1`. A phone web app cannot use that server. Before choosing a wrapper, test a small, source-reviewed sample of TV and radio sources directly on physical iPhone Safari and Android Chrome. Record region, CORS/header requirements, codec, first frame, sustained playback, and background behavior. If a sufficiently reliable direct-play cohort exists, use it for the HTTPS PWA. If not, either narrow the cohort, negotiate an authorized media route, or fund a protected relay after a cost and source-use review. Do not ship a shell that displays a catalog it cannot play.

The shared UI, search, preferences, and catalog schema remain web based. Desktop uses its local Go playback adapter; the PWA uses a browser adapter for approved direct-play media. A native Android adapter, potentially Capacitor with Media3, is chosen only after a device spike. An iOS AVPlayer shell is a regional feasibility track after Apple eligibility is confirmed. Every adapter reports the same playback states and normalized failures so the viewer sees a consistent recovery path.

## Milestones, dependencies, and exit evidence

Effort is in focused engineer-weeks for a small team. It is not a date promise; content permission, signing identity, and external review may take longer.

| Stage | Estimated effort | Required work | Exit evidence |
| --- | ---: | --- | --- |
| **0. Define the release** | 2–4 | Choose working countries and OS floors; settle brand/domain/app IDs; inventory sources, logos and licenses; select at least 30 TV and 30 radio pilot items per launch region; establish takedown and privacy owners. | Approved source register and device matrix; zero unreviewed pilot items; baseline playback table. |
| **1. Shared core and safe desktop** | 3–5 | Version catalog/storage contracts; preserve favorites; deterministic HLS/radio fixtures; harden localhost API; bound caches/sessions; last-known-good guide; source-level failure handling. | Existing desktop flows pass contract and failure tests; no hostile-origin session creation; 30-minute soak without unbounded memory growth. |
| **2. Release engineering** | 2–4 | Target-OS CI smoke, checksums, SBOM, changelog, protected tags, clean-machine artifact checks, reproducible build notes. | Windows/macOS/Linux candidate launches from the downloaded artifact; hash and source tag match; rollback drill succeeds. |
| **3. Hosted mobile web beta** | 3–5 after Stage 0/1 | HTTPS app origin, approved direct-play catalog, manifest/icons, app-shell cache, offline message, Safari/Chrome touch and accessibility work. | Home Screen install/reopen on physical iPhone/iPad and Android; no media cached; first-frame and radio gates measured on two networks. |
| **4. Android direct APK** | 4–7 after playback spike | Stable package ID and key, native playback only where required, audio focus/background controls, permission review, direct update page, developer verification plan. | Signed APK installs and upgrades on ordinary unrooted phones outside Play; signature/hash verified; TV and radio soak passes. |
| **5. Consumer desktop installers** | 4–7 after Stage 2 | Mac app/DMG with Developer ID and notarization; Windows trusted-signed installer or MSIX; Linux AppImage; lifecycle and update path. | Clean install, launch, update, and uninstall on supported OS versions; no missing-signature Gatekeeper error; Windows warning behavior documented. |
| **6. Native iOS feasibility** | 4–8 plus Apple review | Confirm an eligible region and authorized distribution partner or EU web-distribution approval; test AVPlayer/native shell only if it adds real playback value. | Written Apple eligibility and a notarized install/update test on an ordinary eligible-region iPhone. Otherwise close this track and ship the global PWA. |
| **7. Staged public rollout** | 2–4 | Private testers, limited-country beta, support/incident handling, 5%→25%→100% rollout per platform, rollback and takedown rehearsal. | All platform-specific gates pass; 48-hour holds between stages, including a weekend before broad release; release owner signs off. |

Stages 1 and 2 can run alongside source review. Stages 3 and 4 can overlap after the media decision. Stage 6 must never delay Stage 3. Do not merge a mobile release tag because desktop CI passed.

## Non-negotiable release gates

1. **Source permission:** every production stream and logo has a source record with evidence, territory, terms, review date, and takedown path. Experimental community imports are clearly outside the production catalog.
2. **Playback:** on the approved sample, provisional gate is at least 95% reaching first frame within 20 seconds, p95 at most 12 seconds, and at least 95% uninterrupted playback for 10 minutes, measured by platform, region, and network. Radio starts within 10 seconds at least 95% of the time. Fix targets after baseline measurement; publish sample sizes with results. No unqualified “all channels work” claim.
3. **Install and update:** download the actual release candidate, verify signature/hash, install, update while keeping preferences, and uninstall on each supported device class. Simulator builds alone cannot pass this gate.
4. **Accessibility:** zero critical WCAG 2.2 AA issues in onboarding, search, watch, radio, and error recovery. Test keyboard, NVDA, VoiceOver, TalkBack, reduced motion, zoom, and touch; record device/OS results.
5. **Security and privacy:** localhost and hosted APIs have origin/host/rate/resource boundaries; geolocation remains opt-in; network traces match a published plain-language privacy notice; no precise coordinates, search text, or watch history enter default telemetry.
6. **Operations:** per-platform first-frame and crash-free measurements, signed release manifest, working rollback, support contact, urgent stream removal, and a documented response owner.

Stop a rollout for a confirmed rights/privacy incident, a critical assistive-tech failure, launch crashes above 0.5%, or playback below the approved sample gate in two consecutive checks. Roll back catalog sources independently of app binaries where possible.

## Immediate execution backlog

The first cycle is deliberately packaging-neutral and can be reviewed in one pull request or a small sequence of commits:

1. Protect the existing Go loopback endpoints (Host, Origin, content type, bounded sessions and request size) and add negative tests.
2. Make CI execute the compiled app on target OS runners and publish SHA-256 checksums. Record exactly what remains unsigned.
3. Introduce versioned client data/catalog adapters and a pinned radio fallback, without changing the existing visual experience.
4. Create a machine-readable source register schema with unapproved-by-default records and validation. Populate a pilot candidate list; do not invent permission evidence.
5. Run the existing and new tests, smoke the running localhost app, review the diff, and document observed gaps. Then choose the next slice from measured results.

Progress on these items is recorded in [execution log](execution-log.md). No public production claim follows from this cycle alone.

## Owner decisions that cannot be inferred

The owner prefers free hosting if viable. [Cloudflare Pages Free](platform-distribution.md#addendum-a-no-cost-hosted-web-beta-without-video-relay) is the current candidate for a static shell and approved catalog, but the existing Go-dependent TV flow and an oversized AI runtime asset must be resolved before deployment. A paid or unrestricted video relay is not authorized by this preference. Before public mobile hosting or signed distribution, the owner still needs to set the first launch countries, finalize brand and domain, supply the Apple/Android/Windows signing identities, and appoint the source/takedown owner. The engineering work above continues without those choices. The [plan audit](plan-audit.md) explains their consequences.
