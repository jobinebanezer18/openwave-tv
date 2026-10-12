# OpenWave production launch program

**Working plan · 12 October 2026.** Owner decisions: **India first; curated free-channel guide plus private user playlists; downloads from the project website or GitHub, with no App Store or Play Store listing.** Current desktop downloads are unsigned technical previews, not signed consumer releases. This plan covers ordinary iPhone/iPad, Android, macOS, Windows, and Linux devices. The supporting [distribution plan](platform-distribution.md), [architecture roadmap](architecture-roadmap.md), [quality audit](launch-quality.md), and [plan audit](plan-audit.md) contain evidence and platform details; any older store-oriented proposals in those documents are superseded by these owner decisions.

## Launch contract

The product is a free, open-source guide and player for publicly accessible live TV and internet radio. Its first promise is **find a relevant feed and see or hear it play reliably**. The curated India guide records each stream's origin, recent device playback result, and known access/territory limits, and provides a correction/takedown path. A user may separately import a private playlist that stays on their device; imports do not become public guide entries. No paid, encrypted, or DRM OTT stream enters the curated guide without authorization. “AI” means optional local category inference; ordinary name/place/language search must work without a model download.

The desktop app can keep a user-local Go server. The **India iPhone product is an HTTPS website installable from Safari to the Home Screen**; it is a web app, not a native iOS download. Apple's current website distribution route for ordinary native apps is EU-only, so the project must not advertise an India `.ipa` from GitHub or its website ([Apple website distribution](https://developer.apple.com/documentation/marketplacekit/distributing-your-app-from-your-website), [iPhone Home Screen instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27)). Android can additionally ship a signed direct-download APK after the media adapter and verification gates pass ([Android website distribution](https://developer.android.com/distribute/marketing-tools/alternative-distribution)). macOS, Windows, and Linux use direct downloads. No app-store submission appears in this plan.

## Program ownership

| Workstream | Accountable role | Deliverables |
| --- | --- | --- |
| Product and design | Product owner | Final name, supported countries, onboarding and recovery flows, accessibility sign-off, launch copy. |
| Public catalog | Catalog maintainer | Stream provenance, playback and territory notes, disputed-link removal, takedown contact, curated India pilot cohort. Escalate artwork reuse, media relay, or disputed sources for legal review where needed. |
| Core engineering | Maintainer | Versioned catalog, adapters, playback state machine, source health, privacy boundaries, deterministic tests. |
| Platform engineering | Maintainer plus platform testers | Signed desktop packages, Android APK, PWA, conditional iOS native spike, install/update/uninstall evidence. |
| Operations | Release owner | Protected release process, checksums/SBOM, staged rollout, metrics, incident and rollback runbook. |

One person may fill several roles, but each gate needs named sign-off. If a role is unfilled, label the candidate preview rather than silently skipping its review.

## The architecture decision we must prove

The current frontend calls `/api/channels`, `/api/session`, and `/api/media`; the Go server proxies HLS on `127.0.0.1`. A phone web app cannot use that server. Before choosing a wrapper, test a small, India-curated sample of free TV and radio sources directly on physical iPhone Safari and Android Chrome. Record source provenance, known access/territory limits, CORS/header requirements, codec, first frame, sustained playback, and background behavior. If a sufficiently reliable direct-play cohort exists, use it for the HTTPS web app. If not, narrow the cohort or obtain a suitable media route; a relay needs separate source-use, security, and cost review. Do not ship a shell that displays a catalog it cannot play.

The shared UI, search, preferences, and catalog schema remain web based. Desktop uses its local Go playback adapter; the web app uses a browser adapter for curated direct-play media. Private M3U imports are parsed and stored on-device, never uploaded into the public catalog; embedded playlist credentials are treated as sensitive. A native Android adapter, potentially Capacitor with Media3, is chosen only after a device spike. Native iOS packaging is out of scope for India's current outside-store route. Every adapter reports the same playback states and normalized failures so the viewer sees a consistent recovery path.

## Milestones, dependencies, and exit evidence

Effort is in focused engineer-weeks for a small team, not a date promise. Signing identity, physical-device testing, and external reviews may take longer.

| Stage | Estimated effort | Required work | Exit evidence |
| --- | ---: | --- | --- |
| **0. Define the release** | 2–4 | India pilot and OS floors; settle brand/domain/app IDs; collect public-stream provenance and known territory notes; select a practical TV/radio pilot sample; establish correction/takedown and privacy owners. | Versioned India catalog candidate list with provenance, device matrix, and baseline playback table. |
| **1. Shared core and safe desktop** | 3–5 | Version catalog/storage contracts; preserve favorites; deterministic HLS/radio fixtures; harden localhost API; bound caches/sessions; last-known-good guide; source-level failure handling. | Existing desktop flows pass contract and failure tests; no hostile-origin session creation; 30-minute soak without unbounded memory growth. |
| **2. Release engineering** | 2–4 | Target-OS CI smoke, checksums, SBOM, changelog, protected tags, clean-machine artifact checks, reproducible build notes. | Windows/macOS/Linux candidate launches from the downloaded artifact; hash and source tag match; rollback drill succeeds. |
| **3. Hosted mobile web beta** | 3–5 after Stage 0/1 | Free HTTPS app origin, India-curated direct-play catalog, private local M3U import, manifest/icons, app-shell cache, offline message, Safari/Chrome touch and accessibility work. | Home Screen install/reopen on physical iPhone/iPad and Android; private playlist is never uploaded; no media cached; first-frame and radio gates measured on two networks. |
| **4. Android direct APK** | 4–7 after playback spike | Stable package ID and key, native playback only where required, audio focus/background controls, permission review, direct update page, developer verification plan. | Signed APK installs and upgrades on ordinary unrooted phones outside Play; signature/hash verified; TV and radio soak passes. |
| **5. Consumer desktop installers** | 4–7 after Stage 2 | Mac app/DMG with Developer ID and notarization; Windows trusted-signed installer or MSIX; Linux AppImage; lifecycle and update path. | Clean install, launch, update, and uninstall on supported OS versions; no missing-signature Gatekeeper error; Windows warning behavior documented. |
| **6. Native iOS feasibility** | Deferred | No India-native `.ipa` work while Apple has no ordinary direct-install route in India. Reopen only after a platform-rule change or new owner decision. | India install instructions accurately say Safari → Add to Home Screen; no `.ipa` download appears. |
| **7. Staged public rollout** | 2–4 | Private testers, limited-country beta, support/incident handling, 5%→25%→100% rollout per platform, rollback and takedown rehearsal. | All platform-specific gates pass; 48-hour holds between stages, including a weekend before broad release; release owner signs off. |

Stages 1 and 2 can run alongside curation. Stages 3 and 4 can overlap after the media decision. Stage 6 is deferred. Do not merge a mobile release tag because desktop CI passed.

## Non-negotiable release gates

1. **Curated-source hygiene:** every public guide entry records where its free stream came from, recent playback evidence, known territory limits, and a correction/takedown path. Exclude clearly restricted, paywalled, encrypted, or disputed feeds. Private user imports stay local and separate; their streams are the viewer's choice and do not enter this public-catalog gate. Review media relays and protected artwork separately.
2. **Playback:** on the curated India sample, provisional gate is at least 95% reaching first frame within 20 seconds, p95 at most 12 seconds, and at least 95% uninterrupted playback for 10 minutes, measured by platform, region, and network. Radio starts within 10 seconds at least 95% of the time. Fix targets after baseline measurement; publish sample sizes with results. No unqualified “all channels work” claim.
3. **Install and update:** download the actual release candidate, verify signature/hash, install, update while keeping preferences, and uninstall on each supported device class. Simulator builds alone cannot pass this gate.
4. **Accessibility:** zero critical WCAG 2.2 AA issues in onboarding, search, watch, radio, and error recovery. Test keyboard, NVDA, VoiceOver, TalkBack, reduced motion, zoom, and touch; record device/OS results.
5. **Security and privacy:** localhost and hosted APIs have origin/host/rate/resource boundaries; geolocation remains opt-in; network traces match a published plain-language privacy notice; no precise coordinates, search text, or watch history enter default telemetry.
6. **Operations:** per-platform first-frame and crash-free measurements, signed release manifest, working rollback, support contact, urgent stream removal, and a documented response owner.

Stop a rollout for a confirmed source-use/privacy incident, a critical assistive-tech failure, launch crashes above 0.5%, or playback below the curated sample gate in two consecutive checks. Roll back catalog sources independently of app binaries where possible.

## Immediate execution backlog

The first cycle is deliberately packaging-neutral and can be reviewed in one pull request or a small sequence of commits:

1. Protect the existing Go loopback endpoints (Host, Origin, content type, bounded sessions and request size) and add negative tests.
2. Make CI execute the compiled app on target OS runners and publish SHA-256 checksums. Record exactly what remains unsigned.
3. Introduce versioned client data/catalog adapters and a pinned radio fallback, without changing the existing visual experience.
4. Evolve the machine-readable source register into a curation record with provenance, playback timestamp, known territory notes, and takedown state. Populate an India pilot candidate list; do not invent provider affiliation or permissions.
5. Run the existing and new tests, smoke the running localhost app, review the diff, and document observed gaps. Then choose the next slice from measured results.

Progress on these items is recorded in [execution log](execution-log.md). No public production claim follows from this cycle alone.

## Owner decisions that cannot be inferred

The owner chose India first, a curated guide plus private playlists, no app stores, and free hosting if viable. [Cloudflare Pages Free](platform-distribution.md#addendum-a-no-cost-hosted-web-beta-without-video-relay) is the current candidate for a static shell and India catalog, but the existing Go-dependent TV flow and an oversized AI runtime asset must be resolved before deployment. A paid or unrestricted video relay is not implied by that hosting preference. The remaining owner decisions are final brand/domain, Android Developer Console full-distribution identity before wide APK release, Windows/macOS signing identities if polished desktop downloads are desired, physical test devices, and a named public-catalog correction/takedown contact. Apple Developer enrollment is not needed for India's Home Screen web app. The [plan audit](plan-audit.md) explains the earlier plan's open gates; its store and per-feed permission assumptions are superseded here.
