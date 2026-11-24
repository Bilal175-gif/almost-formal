# Almost Formal search and answer visibility report

Date: 25 November 2026. Live site: https://almostformal.shop.

## Verified technical status

- `/shop`, `/stories`, `/blog`, `/returns-policy`, `/shipping-policy`, `/robots.txt`, and `/sitemap.xml` returned HTTP 200 after deployment.
- `/stories` rendered five real Instagram Reel embeds in server HTML. Each supplied Instagram embed URL returned HTTP 200 when checked.
- Product detail pages render server HTML and Product JSON-LD with PKR price, stock availability, URL, images and SKU.
- The sitemap lists public pages and products. Published blog posts are included dynamically. Draft blog posts are excluded from public routes and the sitemap.
- Canonical metadata exists for shop, products, stories, journal and articles. Admin, cart, checkout, wishlist and private tracking are excluded from indexing.
- The live storefront and API run on Cloudflare Workers; D1 stores product, order and editorial records. Product images use Cloudinary URLs.

## Work completed

- Added a dedicated robots route and linked the sitemap.
- Added Organization JSON-LD identifying Almost Formal, its Instagram account and Pakistan service area.
- Added Article/BlogPosting structured data and editorial title, description, canonical and Open Graph metadata.
- Added crawlable, descriptive policy pages, real Reel embeds, and an editable journal with published/draft states.
- Added Pakistan/Lahore geographic metadata and `en-PK` page language. These are targeting signals, not an IP-based access restriction.

## AEO and GEO assessment

The site now provides clear entities, product attributes, policy facts, bylined organization identity and dedicated answerable pages. These make its content easier for search and answer engines to interpret and cite. There is no guarantee of a rich result, AI citation, ranking or traffic increase. A hard geographic block was not added because it would prevent overseas shoppers and crawlers from reading the catalogue; checkout copy states Pakistan delivery.

## Remaining measurement and content work

- Connect Google Search Console and Bing Webmaster Tools, submit the sitemap, and monitor indexed pages, queries and crawl errors. No account access or measurement data was available for this report.
- Publish original, useful journal posts in admin. An empty blog is intentionally not populated with invented articles.
- Confirm courier, delivery timing and refund processing details before publishing numerical promises. The provided copy contained placeholders, so the live policies use only confirmed details.
- Review missing Cloudinary assets and replace broken product images where needed.
- Check Instagram's embed behavior periodically; Instagram can change access or privacy settings outside this site's control.
