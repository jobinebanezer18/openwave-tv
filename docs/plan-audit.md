# Independent plan audit and decisions

Date: 12 October 2026. Inputs: [platform distribution](platform-distribution.md), [architecture roadmap](architecture-roadmap.md), [launch quality audit](launch-quality.md), and the v0.2.0 source tree. This audit is a decision record; it does not certify a release.

## Decisions after audit

| Issue found | Decision | Verification before release |
| --- | --- | --- |
| An ordinary iPhone cannot install an arbitrary native IPA worldwide outside the App Store. | Worldwide iOS route is a hosted HTTPS Home Screen web app. Native iOS remains a separate regional feasibility track; no consumer promise until Apple eligibility, notarization, and installation are demonstrated. | Physical iPhone install from the proposed public route, account/region eligibility evidence, and a tested update. See [Apple alternative distribution](https://developer.apple.com/support/apps-in-the-eu). |
| The UI depends on a Go process bound to localhost. A mobile web shell alone cannot play its proxied catalog. | Prove a direct browser playback cohort first. Only then host the PWA. Keep unsupported feeds out of that route. Prototype native Android playback with the same cohort before selecting a wrapper or plugin stack. A hosted relay is a separate cost, rights, and abuse decision. | Device playback table with source, country, codec, first-frame time, CORS/header need, and rights evidence. |
| The architecture draft selects Capacitor plus Media3/AVPlayer before a physical-device spike. | Treat Capacitor as a candidate, not an irreversible choice. Compare a thin Capacitor prototype with a native player bridge and a simple PWA; retain the shared UI if both pass. | A real Android and eligible iOS test build playing an approved HLS/radio sample, including backgrounding and failure recovery. |
| The quality draft targets p95 first frame ≤12 s, while the architecture draft says <8 s. | Use ≤12 s as a provisional release gate for an approved reference cohort; <8 s is an optimization target. Freeze a final target only after the M0 baseline on specified devices, networks, and regions. | Published numerator, denominator, network profile, p50/p95, and three-day sample. |
| Broad rights language could be read as a legal conclusion for every indexed stream. | Use a conservative product policy: production sources and logos need documented permission or a reviewed basis for use. An index entry is not approval. Keep the community import path as an explicitly local, experimental feature, if retained. | Machine-readable source register with review owner, evidence link, territory, artwork status, and takedown procedure. |
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
- Launch countries, source-permission threshold, and the person handling broadcaster contact/takedown requests.
- The owner prefers free hosting where viable. Cloudflare Pages Free is a candidate for a static shell and small approved catalog, but direct phone playback, the localhost API replacement, and the oversized optional AI asset remain unresolved. A media relay is a separate cost and source-use decision.
- Apple Developer enrollment and alternative-distribution eligibility, Android developer identity/signing, Windows trusted signing, and macOS Developer ID. Do not purchase or submit on the owner's behalf without a concrete budget and identity setup.

We can execute code, tests, documentation, unsigned prototypes, and simulator builds while those decisions remain open. A public production launch remains gated by them.
