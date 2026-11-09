import { db } from "../src/db.js";
const products = [
  ["Blue Polka Vintage Tie", 990, "Floral", "Blue", "Good", 0],
  ["Forest Club Tie", 1290, "Striped", "Green", "Good", 1],
  ["Patchwork Paisley Tie", 1490, "Paisley", "Multicolor", "Excellent", 2],
  ["Red Heritage Tie", 1180, "Geometric", "Red", "Good", 3],
  ["Brown Classic Tie", 1090, "Striped", "Brown", "Worn (character)", 4],
  ["Mustard Statement", 1090, "Floral", "Yellow", "Good", 5],
  ["Vintage Bow Tie", 790, "Solid", "Red", "Excellent", 6],
  ["Navy Geometric Tie", 1390, "Geometric", "Blue", "Good", 7],
] as const;
for (const name of [
  "Regular Ties",
  "Bow Ties",
  "Pocket Squares",
  "Cufflinks",
  "Tie Bars",
]) {
  await db.category.upsert({
    where: { name },
    update: {},
    create: { name, slug: name.toLowerCase().replaceAll(" ", "-") },
  });
}
for (const [title, rupees, pattern, color, condition, index] of products) {
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const category = index === 6 ? "Bow Ties" : "Regular Ties";
  const cat = await db.category.findUniqueOrThrow({
    where: { name: category },
  });
  await db.product.upsert({
    where: { slug },
    update: {},
    create: {
      title,
      slug,
      sku: `AF-DEMO-00${index + 1}`,
      description:
        "A little history, a lot of character. A carefully chosen vintage piece, ready for its next story. Demo catalogue item; photography is generated.",
      price: rupees * 100,
      stock: 1,
      pattern,
      color,
      condition,
      conditionNote:
        condition === "Excellent"
          ? "Excellent vintage condition, with no notable wear."
          : condition === "Good"
            ? "Good vintage condition with minor signs of wear."
            : "Visible age and light wear add character.",
      flaws:
        condition === "Worn (character)"
          ? "Light surface wear; inspect before sale."
          : "No visible flaws in demo imagery; physical inspection required.",
      length: index === 6 ? 12 : 147,
      width: index === 6 ? 6 : 9,
      material: null,
      era: null,
      category,
      featured: true,
      images: {
        create: [
          {
            url: `/images/tie-${index}.webp`,
            alt: `${title} on crumpled vintage paper`,
            position: 0,
          },
        ],
      },
      categories: { create: { categoryId: cat.id } },
      movements: { create: { delta: 1, reason: "Demo inventory seed" } },
    },
  });
}
// Public @almost.formal posts from 16 October 2026. Prices are temporary
// catalogue values requested by the store owner; dimensions are not supplied.
const instagramProducts = [
  ["DejwEjhiG6b", "Retro Line", "Brown tie with subtle fine-line detailing and a vintage feel.", 1190, "Striped", "Brown", false],
  ["DejqQAkCBtD", "Looney Love", "Cartoon tie featuring Looney Tunes characters in a love-themed design.", 1490, "Graphic", "Multicolor", false],
  ["Dejp15XCKJo", "Tigger Tales", "Cartoon tie featuring Tigger from Winnie the Pooh.", 1390, "Graphic", "Multicolor", false],
  ["DejpiTiCMXB", "Molecular Retro", "Brown tie with molecule and chemistry-inspired sketches.", 1290, "Graphic", "Brown", false],
  ["Dejo7FDCMpL", "Crimson Forest", "Slim floral tie with leafy patterns and vintage forest tones.", 1390, "Floral", "Multicolor", false],
  ["DejokWiCOEU", "Pastel Reverie", "Slim floral tie with soft pastel tones.", 1190, "Floral", "Multicolor", true],
  ["DejoNKyiMc0", "Mickey’s Retro Garden", "Vintage tie featuring Mickey Mouse and sunflowers in earthy tones.", 1590, "Graphic", "Multicolor", false],
  ["Dejn8s-CNJ1", "Retro Bloom", "Retro floral tie with a vintage aesthetic.", 1250, "Floral", "Multicolor", true],
  ["DejnYpYCBFm", "The Old Money Check", "Brown and black mini-check tie with a classic vintage feel.", 1290, "Checked", "Brown", false],
  ["Dejm9HRiF5F", "The Royal Crest", "Metallic tie with a regal, sherwani-inspired design.", 1490, "Graphic", "Multicolor", false],
  ["DejmtULiOHh", "Silver Static", "Metallic grey tie with a sleek geometric pattern.", 1190, "Geometric", "Grey", false],
  ["DejmSg5iB8I", "The Dotted Affair", "Vintage tie with playful dotted patterns.", 1090, "Dotted", "Multicolor", false],
  ["Dejl8QVCEdX", "Autumn Reverie", "Autumn-inspired vintage tie.", 1190, "Graphic", "Multicolor", false],
  ["DejkDIIiE9s", "The Brown Bloom", "Brown floral vintage tie.", 1290, "Floral", "Brown", false],
] as const;
const regularTies = await db.category.findUniqueOrThrow({
  where: { name: "Regular Ties" },
});
for (const [code, title, description, rupees, pattern, color, sold] of instagramProducts) {
  await db.product.upsert({
    where: { slug: `instagram-${code.toLowerCase()}` },
    update: {},
    create: {
      title,
      slug: `instagram-${code.toLowerCase()}`,
      sku: `AF-IG-${code}`,
      description: `${description} Listed from @almost.formal. Website price is temporary; confirm details before ordering.`,
      price: rupees * 100,
      stock: sold ? 0 : 1,
      pattern,
      color,
      condition: "Unverified",
      conditionNote: "Instagram caption says quality 10/10; physical condition has not been independently checked.",
      flaws: "Please confirm any wear or flaws with the seller before ordering.",
      length: 0,
      width: 0,
      category: "Regular Ties",
      featured: !sold,
      images: {
        create: [0, 1].map((position) => ({
          url: `/images/instagram/${code}-${position}.webp`,
          alt: `${title}, photo ${position + 1} from Almost Formal Instagram`,
          position,
        })),
      },
      categories: { create: { categoryId: regularTies.id } },
      movements: sold ? undefined : { create: { delta: 1, reason: "Instagram catalogue import" } },
    },
  });
}
await db.storeSettings.upsert({
  where: { id: "store" },
  update: {},
  create: { id: "store" },
});
console.log("Seeded 8 demo ties and 14 Instagram listings. No admin credentials were created.");
await db.$disconnect();
