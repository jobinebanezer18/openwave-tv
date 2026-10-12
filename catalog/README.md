# Source review queue

`rights-register.json` records candidate TV and radio sources for a future production catalog. Every included entry currently has `review_status: "unreviewed"`; this file does **not** claim permission to play or redistribute those streams or to use their artwork.

The review checks how OpenWave would use each source: linking, direct playback, a local proxy, logos, territories, and applicable broadcaster or provider terms. It is a practical release policy, not a blanket statement that public URLs require a license or a legal certification of every internet radio station. A content owner should record a public HTTPS evidence URL or a stable `private:` reference to non-public written permission, along with a review date and territory. `uses_artwork: false` permits a text-only listing without claiming logo rights.

Run `node scripts/validate-rights-register.mjs` for schema checks. `--production` requires at least one complete approved entry, while unreviewed candidates may remain in the queue. This validator is **not yet connected to the runtime catalog**. The production build must later generate an allowlisted snapshot from approved entries only; no public release gate is complete until that code and its tests exist.
