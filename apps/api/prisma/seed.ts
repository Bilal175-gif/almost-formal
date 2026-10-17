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
await db.storeSettings.upsert({
  where: { id: "store" },
  update: {},
  create: { id: "store" },
});
console.log(
  "Seeded 8 demo vintage products. No admin credentials were created.",
);
await db.$disconnect();
