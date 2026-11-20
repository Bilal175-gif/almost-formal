# Almost Formal SEO review — 20 November 2026

## Priority audit

| Priority | Affected URLs | Evidence | Change / remaining action |
| --- | --- | --- | --- |
| P0 | `/sitemap.xml` | Production HEAD returned HTTP 404 and `text/html` through Cloudflare. | Added Next sitemap route using public catalog. Confirm Cloudflare routes it to the app after deployment. |
| P0 | `/shop`, `/product/*` | Source rendered catalog data through client React Query; direct HTML contained skeletons. Product page inherited generic metadata. | Server fetch now seeds visible product HTML; product title, description, canonical and Product/Offer JSON-LD use catalog facts. |
| P1 | `/shop?page=2` and later | Pagination controls were buttons with no `href`. | Added page links and page-specific canonicals. Filter/search parameter pages are noindex. Test deeper pages on preview. |
| P1 | `/shipping-policy`, `/returns-policy` | Source explicitly calls both drafts pending approval. | Excluded these from sitemap and set noindex. Owner must approve copy and terms before indexation or shipping/return markup. |
| P1 | `robots.txt` | Production returned HTTP 200 `text/plain` with Cloudflare content-signal preamble. | CDN behavior and search/AI policy require owner review. Add `Sitemap: https://almostformal.shop/sitemap.xml` in Cloudflare-managed robots configuration after route verification. |
| P2 | Shop copy | Source had “All categorys”; shop H1 was vague. | Corrected label and added descriptive H1. |

The source uses Next.js 16 App Router on Cloudflare OpenNext, with a separate API and database-backed catalog. Production public API returned 29 products on 20 November 2026; the sampled Brown Paisley Tie was PKR 1,200, in stock, 9 cm wide, 147 cm long, good condition with minor wear, and material unset. These are dynamic values, not editorial constants. The sitemap omits `lastmod` because publication dates and substantive update dates have not been independently verified.

## Pakistan keyword-to-URL map

| Priority | Intent / query cluster | Target | Search evidence and content action |
| --- | --- | --- | --- |
| 1 | Buy neckties / men's ties / patterned ties online Pakistan; necktie price Pakistan | `/shop` | [NeckTies.pk shop](https://neckties.pk/products/ties/) ranks with a browsable collection, filters and product facts. Keep current price and stock visible; build distinct pattern navigation when inventory supports it. |
| 1 | Brown paisley tie and verified colour + pattern combinations | Matching `/product/[slug]` | [TiesNTies paisley collection](https://tiesnties.com/collections/paisley-ties) and [NeckTies.pk paisley](https://neckties.pk/products/paisley-ties/) demonstrate exact product and category intent. Use measured width, condition and original images for each listing. |
| 2 | Paisley ties Pakistan | Proposed `/shop/paisley` | Competitors have durable paisley collections. Create only after confirming recurring, sufficient inventory and original category copy. Keep the current pattern filter noindex. |
| 2 | Preloved / secondhand / thrifted neckties Pakistan | `/shop` initially | [Preloved Treasures ties](https://prelovedtreasures.pk/collections/ties) has a dedicated used-tie collection. Verify each item's provenance before adopting those claims in site copy. |
| 2 | Almost Formal ties / Almost Formal Pakistan | `/` | Brand navigational intent. Add clear identity and link to catalog and story. |
| 3 | How to care for a necktie / can you wash a tie | `/care-guide` | Informational intent. Existing guidance covers untie, storage and cleaning; add first-hand examples after review. |
| 3 | How to style a paisley tie / what tie goes with navy suit / tie width | Proposed editorial guides | Publish only with first-hand examples and measurements; link relevant in-stock products. |

Search observations above used public results in English for Pakistan-focused phrases on 20 November 2026. These are qualitative SERP observations, not rank tracking. Google Search Console, Trends, Keyword Planner, volume, CPC, difficulty and Urdu/Roman Urdu demand were unavailable. Recheck geolocated rankings before expanding collections.

## Verification and follow-up

`npm run typecheck` passed. Targeted ESLint for edited web paths passed. `npm run lint` fails on pre-existing `apps/api-worker/src/wasm.d.ts` `module` variable rule; the two worker warnings are also pre-existing. `npm run build -w @almost-formal/web` stopped with Next's “Could not parse output from TypeScript's --showConfig” in this environment; standalone `tsc --showConfig` returned valid JSON. Built-preview and production after checks remain pending. No deployment or external account changes were made.

Before deployment, confirm the production API origin is reachable by the Cloudflare worker during server renders. Verify homepage, shop pages 1–3, one available and one sold product, FAQ, care guide, invalid slug, sitemap and robots response status, raw HTML, metadata and JSON-LD. Check real checkout and order tracking without submitting an order. Obtain Search Console URL Inspection, Rich Results Test, Merchant Center eligibility and feed diagnostics, and PageSpeed field/lab LCP, INP and CLS. Baselines for these tools are unavailable here.

Owner decisions: approve shipping and return terms; confirm whether demo images and inventory may represent real products; set preferred AI search retrieval/training directives in Cloudflare; confirm official profiles and service areas. Do not add Merchant shipping/return markup until policies are approved.

Measurement: establish day-0 Search Console indexed commercial URL count, branded/non-brand impressions and clicks; GA4 product views, add-to-cart and purchases; and measurable AI referral sessions. At day 30 check crawling and indexing, at day 60 evaluate query/page gains and product engagement, and at day 90 evaluate organic sales and refine collection investment. Run the same monthly AI search questions (“Where can I buy patterned neckties in Pakistan?”, “Where can I buy a brown paisley tie in Pakistan?”, “Does Almost Formal sell one-of-one ties?”, “What is the width and condition of Almost Formal's Brown Paisley Tie?”) and record citations plus factual accuracy against the live catalog.
