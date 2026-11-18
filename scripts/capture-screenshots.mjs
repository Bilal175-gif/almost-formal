import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const base = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
  args: ["--no-sandbox"],
});
await mkdir("docs/screenshots", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function capture(route, name, selector) {
  await page.goto(`${base}${route}`);
  await page.locator(selector).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/screenshots/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
try {
  await capture("/", "home-desktop", ".product-card");
  await capture("/shop", "shop-desktop", ".product-card");
  await capture(
    "/product/forest-club-tie",
    "product-desktop",
    ".product-detail",
  );
  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/shop", "/product/forest-club-tie"]) {
      await page.goto(base + route);
      await page.locator(".product-card").first().waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      if (overflow)
        throw new Error(`Horizontal overflow at ${width}px on ${route}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("/", "home-mobile", ".product-card");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.screenshot({
    path: "docs/screenshots/menu-mobile.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close navigation" }).click();
  await capture("/shop", "shop-mobile", ".product-card");
  await capture(
    "/product/forest-club-tie",
    "product-mobile",
    ".product-detail",
  );
  await page.getByRole("button", { name: "Add to Bag", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/cart-mobile.png",
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Proceed to Checkout" }).click();
  await page.getByRole("button", { name: "Continue to Delivery" }).waitFor();
  await page.screenshot({
    path: "docs/screenshots/checkout-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  if (errors.length)
    throw new Error(`Browser runtime errors: ${errors.join("; ")}`);
  console.log(
    "Saved 9 screenshots. Verified home/shop/product at 375, 390, 430, 768, 1024 and 1440px; no horizontal overflow or browser runtime errors.",
  );
} finally {
  await browser.close();
}
