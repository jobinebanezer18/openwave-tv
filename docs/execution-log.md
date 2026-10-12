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

## Verification status

- JavaScript search/radio tests: **9 passed**. Rights-register tests: **4 passed**. Production web build completed.
- Go tests, race tests, vet, and diff whitespace checks passed locally.
- Local packaged macOS arm64 smoke verified archive hash, loopback startup, HTML, favicon, and embedded JS asset.
- Local browser test verified first-run preferences and bundled radio catalog on the development server.
- First changed-workflow run: Linux and Windows packaged smoke passed; the macOS runner failed before smoke execution because the CI-selected Go 1.22 toolchain's `go run` binary lacked an `LC_UUID` load command required by that runner. CI is now pinned to [Go 1.27.2](https://go.dev/doc/devel/release), a current supported release; the rerun is pending. This is a toolchain compatibility issue, not a passed macOS install test.
- Physical iOS/Android playback, direct APK install, signed desktop install/update, rights review, multi-region stream reliability, accessibility audit: **not yet performed**.

## What is still blocked from a production claim

The rights register is a guardrail, not proof of permission. The current app still indexes a broad upstream catalog and has no approved production cohort. The radio snapshot contains directory metadata and is not a curated station rights list. A phone PWA needs an HTTPS origin and a media path that works without the desktop Go process. No native mobile package or signed desktop installer exists. Platform-specific launch gates in the plan remain open.

## Next measured slice

Choose the first launch country and name a content/rights owner. Build a small approved-source snapshot; test actual first-frame and 10-minute playback on physical iPhone and Android over two networks. Use those measurements to decide whether direct browser playback is sufficient for the PWA and whether a native Android player is needed. In parallel, complete signed desktop packaging once owner signing identities are available.
