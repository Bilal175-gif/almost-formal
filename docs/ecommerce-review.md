# Almost Formal e-commerce review

Reviewed 12 November 2026 against [Skullberries' ties collection](https://skullberries.com/collections/ties) and [one in-stock product](https://skullberries.com/products/statue-of-liberty-tie). The competitor page is a live store, so its catalogue and prices may change.

## What the comparison shows

| Area | Competitor page | Almost Formal |
| --- | --- | --- |
| Discovery | Large catalogue, availability, color and price filters, multiple sort options | Search and sort existed; category, pattern, color, condition, price and in-stock filters are now added |
| Product cards | Price, sold-out state and quick add | Price, quick look, quick add and wishlist already existed; stock badge now uses real inventory |
| Product detail | Prominent price and add-to-cart; little condition information on the inspected product | Photos, dimensions, condition and flaws are stronger; direct COD buy path is now added |
| Checkout | Shopify account/cart/checkout flow | Guest COD checkout, server-side stock reservation, idempotency and order tracking already exist; the redundant delivery/payment steps are now combined into a two-step flow |
| Notifications | Not verified from the public pages | SMTP order and contact notifications are now wired; delivery needs an App Password |

## Launch priorities

1. **Replace demo and unverified catalogue data.** Some current products say their condition is unverified and prices are temporary. Confirm each item's price, fabric, measurements, flaws, photos and stock before taking real orders. Keep the “only one left” message tied to actual stock.
2. **Approve the business policies.** Shipping, returns and terms currently say they are drafts. Decide dispatch time, coverage, courier, delivery charges, return window, damaged-item handling and contact channel. Then replace the draft text in the site. These details directly affect buyer trust and support workload.
3. **Activate and test email.** Add a Gmail App Password in the local `.env`, run `npm run smtp:test`, then place a test order and verify customer/admin messages and shipment updates. For production, use a verified domain sender or transactional email provider. Gmail is suitable for initial testing.
4. **Operate orders consistently.** Confirm COD orders promptly, enter carrier and tracking number before marking shipped, and reconcile delivered COD payments. Make a daily database and uploads backup on the production host.
5. **Measure real friction.** Track product views, add-to-bag, checkout starts and completed orders with a privacy-conscious analytics setup. Review search terms with no results and where shoppers leave checkout before changing the design further.
6. **Go live on a persistent host.** Use HTTPS, a stable database and uploads directory, backups, monitoring and an internal API port. The current SQLite and local image storage need persistent disks.

## Conversion principles for this store

Show the price, condition, visible flaws, delivery cost and COD total before order placement. Offer a direct purchase path and keep the form short. Use genuine stock information and clear delivery promises. Avoid fabricated reviews, countdown timers, or scarcity claims that the inventory cannot support. Fast ordering should come from fewer decisions and reliable responses, not pressure.

Online card/JazzCash/EasyPaisa payment is intentionally outside this COD-only setup. Add it only after the merchant account, settlement and refund process are ready.
