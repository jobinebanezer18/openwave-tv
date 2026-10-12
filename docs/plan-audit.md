# Independent plan audit and decisions

Date: 12 October 2026. Inputs: [platform distribution](platform-distribution.md), [architecture roadmap](architecture-roadmap.md), [launch quality audit](launch-quality.md), and the v0.2.0 source tree. This audit is a decision record; it does not certify a release.

## Decisions after audit

| Issue found | Decision | Verification before release |
| --- | --- | --- |
| An ordinary iPhone in India cannot install an arbitrary native IPA from a website. | India iOS route is a hosted HTTPS Home Screen web app. Native iOS is out of scope unless the owner changes the target or Apple adds an India-eligible route. | Physical iPhone install from Safari and a tested update. See [Apple alternative distribution](https://developer.apple.com/support/apps-in-the-eu). |
| The desktop UI depends on a Go process bound to localhost. | A separate browser-only web build now uses a 49-candidate India catalog and direct HTTPS HLS; desktop Chromium playback passed for six named feeds, while B4U Music was removed for browser CORS failure. Do not count this as physical-device validation. Keep unsupported feeds out and prototype native Android playback only if device results show a need. A hosted relay remains a separate cost, rights, and abuse decision. | Physical-device playback table with source, country, codec, first-frame time, CORS/header need, and rights/provenance evidence. |
| The architecture draft selects Capacitor plus Media3/AVPlayer before a physical-device spike. | Treat Capacitor as a candidate, not an irreversible choice. Compare a thin Capacitor prototype with a native player bridge and a simple PWA; retain the shared UI if both pass. | A real Android and eligible iOS test build playing an approved HLS/radio sample, including backgrounding and failure recovery. |
| The quality draft targets p95 first frame ≤12 s, while the architecture draft says <8 s. | Use ≤12 s as a provisional release gate for an approved reference cohort; <8 s is an optimization target. Freeze a final target only after the M0 baseline on specified devices, networks, and regions. | Published numerator, denominator, network profile, p50/p95, and three-day sample. |
| Broad rights language could be read as a legal conclusion for every indexed stream. | For a community alpha, record provenance, public/free status, playback check, known access limits, and a removal path; written permission for every free stream is not a prerequisite. Handle protected artwork, paid/DRM feeds, and challenges separately. Keep user imports private and local. | Source register with review owner, provenance, territory/access notes, artwork status, and takedown procedure. |
| “Remove all dead channels” cannot be guaranteed by a periodic HTTP checker. Current global quarantine also conflates a regional failure with a worldwide failure. | Launch claims use the eligible curated cohort and regional measurements. Move health state toward per-source, per-region results. Never market the raw upstream count as confirmed playable. | Multi-region first-frame and sustained playback results, expired status handling, and visible recovery on failure. |
| Desktop cross-compilation is green but artifacts have not run on Windows/macOS CI. | Add target-OS executable smoke jobs and release checksums now. Signing, notarization, installer updates, and clean-device playback remain later gates requiring owner identities or devices. | CI logs from each target OS plus clean-machine install evidence for signed candidates. |
| A service worker could suggest offline TV or cache media without permission. | Cache only versioned app shell assets and an approved metadata snapshot. Never cache live media or third-party logos by default. Show an honest offline state. Defer service-worker registration until a hosted origin and API adapter are tested. | Network trace in online/offline modes; no media cache entries; no stale API response presented as live. |

## Scope of the immediate execution cycle

The first implementation cycle addresses work that is useful regardless of native-shell choice:

1. Harden the desktop loopback API boundary with Host/Origin/JSON checks and bounded request/session resources, with negative tests.
2. Add target-OS build smoke checks and release checksums to CI. The artifacts remain labeled technical preview until signing and clean install are done.
3. Introduce a versioned client storage/catalog seam and a pinned radio catalog fallback, with migration/error tests. Do not change the visual design or imply mobile installability yet.
4. Create a source review register and a small launch-candidate list. Do not mark any feed approved without evidence.

The cycle is complete when tests run locally and in CI, a reviewer can trace the source/license decision for each candidate, and existing desktop playback and favorites still work. These are engineering foundations, not an iOS or Android release.

## Open owner decisions and external gates

- Final brand, domain, app/package IDs, and trademark review. `OpenWave` remains a working identifier.
- Named contact for catalog corrections and takedown requests; India is the first launch country and the alpha source policy is recorded below.
- The owner prefers free hosting where viable. Cloudflare Pages Free is the current static-shell candidate. The web build has a direct-browser playback adapter, excludes the optional AI model, and passes the configured 25 MiB asset gate. Physical phone testing and deployment remain open. A media relay is a separate cost and source-use decision.
- Android developer identity/signing, Windows trusted signing, and macOS Developer ID. Apple Developer enrollment is not needed for the India Home Screen web app. Do not purchase or submit on the owner's behalf without a concrete budget and identity setup.

We can execute code, tests, documentation, unsigned prototypes, and simulator builds while those decisions remain open. A public production launch remains gated by them.

## Decision update: India and personal playlists

The owner chose India for the first beta, a curated public guide **plus user-supplied private playlists**, and installation outside the App Store and Play Store. This changes the acceptance criteria:

- Treat public curated sources and user-imported sources as separate trust domains. An imported playlist is a file the viewer chooses; it must not silently enter the public catalog, be uploaded to OpenWave, or be included in default analytics or issue reports. Token-bearing stream URLs need explicit local retention rules.
- The first local-desktop import slice may keep entries in page memory for the current session. It must label that limit. Production quality later requires a considered reimport or encrypted local-persistence design, migration tests, and a clear delete action.
- Arbitrary HLS URL proxying is acceptable only behind the local Host/Origin boundary with strict URL/size/resource limits. A hosted version must not expose the same endpoint as an open internet relay. Private IP/LAN stream support is a separate security and product decision.
- The global outside-store iPhone route remains a Home Screen web app. A direct native IPA from GitHub is not a general installation method for ordinary iPhones in India under current Apple rules. Do not describe the PWA as a native IPA.
- Android can use a properly signed direct-download APK. Windows, macOS, and Linux can use GitHub/website downloads, with signing/notarization work still required for a consumer-quality experience.

The India product route is the website/GitHub for desktop and Android downloads, plus the website's Home Screen web app for iPhone. There are no app-store listings. Free static hosting is preferred if the mobile playback architecture works within its limits. Measure curated India guide playback and private-playlist playback separately; success of a user's private URL cannot be counted as evidence about public guide reliability.

## Policy calibration after owner feedback

The owner wants a community product without a heavy permission bureaucracy. For an **alpha**, the practical bar is a source record, a publicly accessible free stream, a playback check, basic territory/branding notes when known, and a working removal path. Prefer broadcaster-published feeds. Written broadcaster permission for every free stream is **not** a prerequisite to implementing or testing the alpha. Claims of affiliation, use of protected artwork, paid/DRM feeds, and any takedown request need closer handling before broad promotion. A user's local playlist remains their own import and does not enter the curated guide or its review queue.

This calibration changes the process burden; it does not turn a public URL into a guaranteed right or override iOS installation rules. The production source register and launch copy should use plain provenance and usage status rather than calling every item “rights-cleared.”
