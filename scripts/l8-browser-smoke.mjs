import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const root = process.env.FC1_PLAYWRIGHT_ROOT;
if (!root) throw new Error("FC1_PLAYWRIGHT_ROOT is required");
const { chromium } = createRequire(root + "/package.json")("playwright");
const base = (process.env.FC1_REVIEW_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const output = process.env.FC1_REVIEW_OUTPUT || ".tmp/fc1-v4-review";
const report = { sha: process.env.FC1_REVIEW_SHA || "", checks: [], errors: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const locale of ["zh", "de", "en"]) {
    for (const [device, viewport] of [
      ["desktop", { width: 1440, height: 900 }],
      ["mobile", { width: 390, height: 844 }],
      ["compact", { width: 320, height: 720 }],
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const home = await page.goto(base + "/" + locale + "/", { waitUntil: "domcontentloaded" });
        assert.equal(home?.status(), 200);
        const launch = page.locator('[data-home-product-collection] article:has(a[href="/' + locale + '/explore/l1"])');
        assert.equal(await launch.count(), 1, "One L8 card in the homepage collection");
        await launch.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => {
          const image = document.querySelector('[data-home-product-collection] a[href$="/explore/l1"] img');
          return image?.complete && image.naturalWidth > 0;
        });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Homepage fits viewport");
        await launch.screenshot({ path: output + "/l8-home-" + locale + "-" + device + ".png" });
        await launch.locator("a").first().click();
        await page.waitForURL("**/" + locale + "/explore/l1");
        const product = page.locator('main[data-l8-product="1"]');
        await product.waitFor({ state: "visible" });
        assert.equal(await product.getAttribute("lang"), locale);
        assert.equal(await product.locator("[data-public-site-header]").count(), 1);
        assert.match(await product.locator("h1").innerText(), /ALSVID\s*L1/);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://www.alsvidbike.com/" + locale + "/explore/l1");
        assert.equal(await page.locator('link[rel="alternate"][hreflang]').count(), 4);
        await page.waitForFunction(() => {
          const image = document.querySelector('[data-l8-photo="side"]');
          return image?.complete && image.naturalWidth > 0;
        });
        const gallery = product.locator("[data-l8-gallery]");
        const controls = gallery.locator("button");
        assert.equal(await controls.count(), 2);
        await controls.nth(1).focus();
        await controls.nth(1).press("Enter");
        await page.waitForFunction(() => {
          const image = document.querySelector('[data-l8-photo="folded"]');
          return image?.complete && image.naturalWidth > 0;
        });
        assert.equal(await controls.nth(1).getAttribute("aria-pressed"), "true");
        assert.equal(await gallery.locator("[data-l8-photo]").getAttribute("src"), "/products/l8/retouched-folded.webp");
        assert.equal(await gallery.locator("[data-l8-original]").getAttribute("href"), "/products/l8/reference-folded.png");
        await controls.nth(0).click();
        assert.equal(await controls.nth(0).getAttribute("aria-pressed"), "true");
        assert.equal(await gallery.locator("[data-l8-photo]").getAttribute("src"), "/products/l8/retouched-side.webp");
        assert.equal(await gallery.locator("[data-l8-original]").getAttribute("href"), "/products/l8/reference-side.png");
        for (const anchor of ["design", "folding", "specifications", "availability"]) {
          await product.locator('nav a[href="#' + anchor + '"]').click();
          await page.waitForFunction(id => location.hash === "#" + id, anchor);
          assert.ok(await product.locator("#" + anchor).isVisible());
        }
        await product.locator("#folding img").scrollIntoViewIfNeeded();
        await page.waitForFunction(() => [...document.querySelectorAll("[data-l8-product] img")].every(image => image.complete && image.naturalWidth > 0));
        assert.equal(await product.locator("#specifications dl > div").count(), 9);
        assert.ok((await product.locator("#specifications").innerText()).includes("SHENGYI"));
        assert.ok((await product.locator("#availability p").last().innerText()).length > 40);
        assert.equal(await product.locator('section a[href*="checkout"],section a[href*="reserve"],section a[href*="cart"]').count(), 0, "L8 has no sales action");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "L8 fits " + device);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: output + "/l8-product-" + locale + "-" + device + ".png", fullPage: true });
        if (device === "desktop") {
          await page.goto(base + "/" + locale + "/explore/l8", { waitUntil: "domcontentloaded" });
          assert.equal(new URL(page.url()).pathname, "/" + locale + "/explore/l1", "Legacy L8 redirects to L1");
          await page.goto(base + "/" + locale + "/explore/100001", { waitUntil: "domcontentloaded" });
          assert.equal(new URL(page.url()).pathname, "/" + locale + "/explore/l1", "Legacy F8 product ID redirects to L1");
        }
        await page.goto(base + "/" + locale + "/explore/l1", { waitUntil: "domcontentloaded" });
        const target = locale === "en" ? "de" : "en";
        if (device === "desktop") {
          await page.locator('header details[class*="switcher"] summary').click();
        } else {
          await page.locator("header > details summary").click();
        }
        const language = page.locator('header a[hreflang="' + target + '"]:visible').first();
        assert.equal(await language.getAttribute("href"), "/" + target + "/explore/l1");
        await language.click();
        await page.waitForURL("**/" + target + "/explore/l1");
        assert.ok((await context.cookies()).some(cookie => cookie.name === "alsvid-locale-v2" && cookie.value === target));
        assert.deepEqual(errors, [], "No browser runtime errors");
        report.checks.push(locale + " " + device + ": homepage entry, detail route, photos, gallery keyboard, chapter links, reference specs, language switch, metadata, responsive width");
      } finally {
        await context.close();
      }
    }
  }
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack || error.message : String(error));
  throw error;
} finally {
  await browser.close();
  await writeFile(output + "/l8-browser-report.json", JSON.stringify(report, null, 2) + "\n");
}
