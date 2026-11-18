# Reference implementation map

The supplied image is a contact sheet of separate desktop and mobile screens. It is implemented as navigable pages, rather than one image of a website.

## Visual system

- Forest green `#194B3A`, vintage cream `#F5ECD9`, mustard `#F4B544`, rust `#C94B35`, vintage ink `#25211E`.
- Libre Caslon Display for the wordmark and editorial headings; DM Sans for interface text; Barlow Condensed for product titles and the large cut-paper headline; Caveat for handwritten annotations. Fonts are stored locally.
- Cream paper surfaces, procedural SVG paper grain, torn edges, tape, rotated labels, hand-drawn SVG stars, arrows and smiling faces.
- Desktop homepage: full-width cream header, large collage hero, three benefits, featured products, green story collage, mustard thrift poster, thrift benefits and social gallery. Newsletter and footer extend the supplied design as requested in the written brief.
- Desktop shop: left filter column, heading, search/sort toolbar and four product columns. At tablet widths the product grid uses two columns to preserve legibility.
- Mobile homepage follows the reference phone screen: compact header, search, circular categories, two-column featured finds, bottom navigation. The desktop hero is intentionally omitted on phones to preserve the supplied mobile layout.
- Mobile menu uses handwritten links, doodles and the mustard “Good ties / Happier people” note.
- Product page uses the supplied gallery/thumbnail layout, condition tags, details and green Add to Bag button. On narrow screens the action remains sticky within the product section.
- Cart uses a native accessible modal drawer. Checkout follows the compact cream form treatment from the reference.

## Original assets and fidelity

The reference screenshot does not include its original fonts, product photos or layered artwork. Generated tie photography is a stylistic replacement, not an extraction or a claim to the same physical merchandise. Exact pixel identity is not possible from those replacements. Generated images are demo content and must be replaced with actual photography before accepting real customer orders. Materials and eras are left unverified rather than invented.

The original product asset sheet and hero image are retained under `apps/web/public/images/`. Product image crops are available as WebP files. See `assets.md` for generation prompts.

Screenshots from browser validation are written under `docs/screenshots/`. Compare those with the original reference, especially the desktop hero, shop proportions, mobile menu and product page.
