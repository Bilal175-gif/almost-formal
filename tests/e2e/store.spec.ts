import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../apps/api/src/db";
let productId = "";
let slug = "";
test.beforeAll(async () => {
  slug = `e2e-${randomUUID()}`;
  const p = await db.product.create({
    data: {
      slug,
      sku: slug,
      title: "E2E Vintage Test Tie",
      description:
        "A temporary product used only for automated checkout testing.",
      price: 129000,
      stock: 1,
      pattern: "Striped",
      color: "Green",
      condition: "Good",
      conditionNote: "Test condition",
      flaws: "None",
      length: 147,
      width: 9,
      images: { create: { url: "/images/tie-1.webp", alt: "Test tie" } },
    },
  });
  productId = p.id;
});
test.afterAll(async () => {
  if (productId) {
    const orders = await db.order.findMany({
      where: { items: { some: { productId } } },
    });
    for (const order of orders) {
      await db.payment.deleteMany({ where: { orderId: order.id } });
      await db.shipment.deleteMany({ where: { orderId: order.id } });
      await db.order.delete({ where: { id: order.id } });
      await db.address.delete({ where: { id: order.addressId } });
    }
    await db.inventoryMovement.deleteMany({ where: { productId } });
    await db.product.delete({ where: { id: productId } });
  }
  await db.$disconnect();
});
test("homepage, search, wishlist and persistent bag work", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /OLD.*TIES.*NEW.*STORIES./ }),
  ).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(4);
  await page.screenshot({
    path: "docs/screenshots/home-desktop.png",
    fullPage: true,
  });
  await page.goto("/shop");
  await page
    .getByRole("textbox", { name: "Search collection" })
    .fill("Forest Club");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Save Forest Club Tie to wishlist" })
    .click();
  await page.goto("/wishlist");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page.goto(`/product/${slug}`);
  await page.getByRole("button", { name: "Add to Bag", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "shopping bag" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close shopping bag" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Open bag, 1 items" }).click();
  await expect(
    page.getByRole("dialog").getByText("E2E Vintage Test Tie", { exact: true }),
  ).toBeVisible();
});
test("checkout creates a real order and tracking shows saved state", async ({
  page,
}) => {
  await page.goto(`/product/${slug}`);
  await page.getByRole("button", { name: "Add to Bag", exact: true }).click();
  await page.getByRole("link", { name: "Proceed to Checkout" }).click();
  await page.getByRole("button", { name: "Continue to Delivery" }).click();
  await expect(page.getByText("Enter a valid phone number")).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("E2E Customer");
  await page
    .locator(".checkout-layout")
    .getByLabel("Email address", { exact: true })
    .fill("e2e@example.test");
  await page.getByLabel("Phone number", { exact: true }).fill("03001234567");
  await page.getByLabel("Street address").fill("123 Testing Street");
  await page.getByLabel("City", { exact: true }).fill("Karachi");
  await page.getByLabel("Province").selectOption("Sindh");
  await page.getByLabel("Postal code").fill("75500");
  await page.getByRole("button", { name: "Continue to Delivery" }).click();
  await page.getByRole("button", { name: "Continue to Payment" }).click();
  await page.getByRole("button", { name: "Review your order" }).click();
  await page
    .getByRole("button", { name: "Place order — Cash on Delivery" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good choice. Great story." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Track your order", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Track my order" }).click();
  await expect(page.locator(".tracking-result .status-badge")).toHaveText(
    "pending",
  );
  expect(
    (await db.product.findUniqueOrThrow({ where: { id: productId } })).stock,
  ).toBe(0);
});
test("responsive layouts, mobile menu, filters and product page have no overflow", async ({
  page,
}) => {
  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/shop");
    await expect(
      page.getByRole("heading", { name: "Good finds, gone fast." }),
    ).toBeVisible();
    await expect(page.locator(".product-card").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `shop overflow at ${width}`,
    ).toBeTruthy();
    if (width === 390)
      await page.screenshot({
        path: "docs/screenshots/shop-mobile.png",
        fullPage: true,
      });
    if (width === 1440)
      await page.screenshot({
        path: "docs/screenshots/shop-desktop.png",
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".product-card").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "home mobile overflow",
  ).toBeTruthy();
  await page.screenshot({
    path: "docs/screenshots/home-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog", { name: "navigation" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/menu-mobile.png" });
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Care guide" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Keep the story going." }),
  ).toBeVisible();
  await page.goto("/product/forest-club-tie");
  await expect(
    page.getByRole("heading", { name: "Forest Club Tie", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "docs/screenshots/product-mobile.png",
    fullPage: true,
  });
  await page.goto("/shop");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Paisley", { exact: true }).check();
  await page.getByRole("button", { name: "Show finds" }).click();
  await expect(page.locator(".product-card")).toHaveCount(1);
});
