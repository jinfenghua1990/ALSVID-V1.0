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
        const response = await page.goto(base + "/" + locale + "/", { waitUntil: "domcontentloaded" });
        assert.equal(response?.status(), 200);
        const header = page.locator("[data-public-site-header]");
        for (const model of ["l7", "l1"]) {
          const link = header.locator('a[href="/' + locale + '/explore/' + model + '"]:visible').first();
          assert.ok(await link.isVisible(), model + " is visible in the top navigation");
          assert.equal((await link.innerText()).trim(), model === 'l7' ? 'A1' : 'L1');
        }
        if (device !== "desktop") {
          const models = header.locator('nav[class*="mobileModels"] a');
          assert.equal(await models.count(), 4);
          for (const link of await models.all()) assert.ok(await link.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "Mobile model labels fit");
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Homepage fits viewport");
        await header.screenshot({ path: output + "/model-header-" + locale + "-" + device + ".png" });
        assert.equal(await page.locator('[data-home-product-collection] article:has(a[href="/' + locale + '/explore/l7"])').count(), 1,
          'L7 remains discoverable in the homepage model collection');
        await header.locator('a[href="/' + locale + '/explore/l7"]:visible').first().click();
        await page.waitForURL("**/" + locale + "/explore/l7");
        const product = page.locator('[data-l7-product="1"]');
        await product.waitFor();
        assert.equal(await product.locator('header a[aria-current="page"]:visible').first().innerText(), "A1");
        assert.match(await product.locator("h1").innerText(), /ALSVID\s*A1/);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://www.alsvidbike.com/" + locale + "/explore/l7");
        const gallery = product.locator("[data-l7-gallery]");
        await gallery.locator("button").nth(1).focus();
        await gallery.locator("button").nth(1).press("Enter");
        await page.waitForFunction(() => { const image = document.querySelector('[data-l7-photo="folded"]'); return image?.complete && image.naturalWidth > 0; });
        assert.equal(await gallery.locator("button").nth(1).getAttribute("aria-pressed"), "true");
        await gallery.locator("button").nth(0).click();
        assert.equal(await product.locator("#specifications dl > div").count(), 12);
        assert.equal(await product.locator('section a[href*="checkout"],section a[href*="reserve"]').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "L7 fits viewport");
        await page.waitForFunction(() => { const image = document.querySelector('[data-l7-photo="side"]'); return image?.complete && image.naturalWidth > 0; });
        await page.screenshot({ path: output + "/l7-top-" + locale + "-" + device + ".png" });
        if (device === "desktop") await page.locator('header details[class*="switcher"] summary').click();
        else await page.locator("header > details summary").click();
        const target = locale === "en" ? "de" : "en";
        await page.locator('header a[hreflang="' + target + '"]:visible').first().click();
        await page.waitForURL("**/" + target + "/explore/l7");
        const catalog = await page.goto(base + "/" + locale + "/bikes#accessories", { waitUntil: "domcontentloaded" });
        assert.equal(catalog?.status(), 200);
        const cup = page.locator('[data-accessory-product="cup-holder"]');
        assert.equal(await cup.count(), 1);
        await cup.locator("a").last().click();
        await page.waitForURL("**/" + locale + "/explore/accessory-cup-holder");
        await page.locator('[data-cup-holder-product="1"]').waitFor();
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://www.alsvidbike.com/" + locale + "/explore/accessory-cup-holder");
        const video = page.locator("[data-cup-video]");
        assert.equal(await video.count(), 1);
        assert.notEqual(await video.getAttribute("controls"), null);
        assert.notEqual(await video.getAttribute("playsinline"), null);
        assert.equal(await video.getAttribute("autoplay"), null);
        assert.equal(await video.getAttribute("preload"), "metadata");
        assert.equal(await video.evaluate(el => el.paused), true, "Product video never autoplays");
        await video.evaluate(el => el.load());
        await page.waitForFunction(() => { const el = document.querySelector("[data-cup-video]"); return el.readyState >= 1 || el.error; });
        const media = await video.evaluate(el => ({ duration: el.duration, width: el.videoWidth, height: el.videoHeight, error: el.error?.message }));
        assert.equal(media.error, undefined);
        assert.ok(media.duration > 28 && media.duration < 30, "The complete original video is available");
        assert.equal(media.width, 720);
        assert.equal(media.height, 960);
        const range = await context.request.get(base + "/products/accessories/cup-holder/product-demo.mp4", { headers: { Range: "bytes=0-1023" } });
        assert.equal(range.status(), 206, "The server supports video seeking via byte ranges");
        assert.ok(range.headers()["content-type"].startsWith("video/mp4"));
        assert.equal((await range.body()).length, 1024);
        await video.evaluate(async el => { el.muted = true; await el.play(); });
        await page.waitForFunction(() => document.querySelector("[data-cup-video]").currentTime > 0.2);
        await video.evaluate(el => { el.pause(); el.currentTime = 14; });
        await page.waitForFunction(() => { const el = document.querySelector("[data-cup-video]"); return !el.seeking && el.readyState >= 2 && Math.abs(el.currentTime - 14) < 0.5; });
        await video.evaluate(async el => { el.currentTime = el.duration - 0.3; await el.play(); });
        await page.waitForFunction(() => document.querySelector("[data-cup-video]").ended);
        await video.evaluate(el => { el.pause(); el.currentTime = 0; });
        await page.locator("[data-cup-video-section]").screenshot({ path: output + "/cup-holder-video-" + locale + "-" + device + ".png" });
        const cupGallery = page.locator("[data-cup-holder-gallery]");
        assert.equal(await cupGallery.locator("[data-cup-colour]").count(), 6);
        assert.equal(await cupGallery.locator("[data-cup-photo]").count(), 5);
        assert.match(await cupGallery.locator("figure img").getAttribute("src"), /retouched\/cup-holder-black\.webp$/);
        for (const button of await cupGallery.locator('[data-cup-colour][aria-pressed="false"]').all()) {
          const contrast = await button.evaluate(el => {
            const luminance = colour => {
              const channels = colour.match(/[0-9.]+/g).slice(0, 3).map(Number).map(value => {
                const channel = value / 255;
                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
              });
              return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            };
            const text = luminance(getComputedStyle(el).color);
            const background = luminance(getComputedStyle(el.closest("main")).backgroundColor);
            return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
          });
          assert.ok(contrast >= 4.5, "Inactive colour labels have readable contrast on the light panel");
        }
        for (const photo of ["01", "02", "03", "04", "05"]) {
          await cupGallery.locator('[data-cup-photo="' + photo + '"]').click();
          await page.waitForFunction(id => { const image = document.querySelector("[data-cup-holder-gallery] figure img"); return image?.src.includes("gallery-" + id) && image.complete && image.naturalWidth > 0; }, photo);
        }
        for (const colour of ["black", "green", "pink", "violet", "orange", "cream"]) {
          const button = cupGallery.locator('[data-cup-colour="' + colour + '"]');
          await button.focus();
          await button.press("Enter");
          await page.waitForFunction(id => { const image = document.querySelector("[data-cup-holder-gallery] figure img"); return image?.src.includes("cup-holder-" + id) && image.complete && image.naturalWidth > 0; }, colour);
          assert.equal(await button.getAttribute("aria-pressed"), "true");
          assert.match(await cupGallery.locator("figure img").getAttribute("src"), /\/retouched\//);
          assert.ok((await cupGallery.locator("[data-cup-original]").getAttribute("href")).endsWith("cup-holder-" + colour + ".webp"));
          if (locale === "zh" && device === "desktop") await cupGallery.screenshot({ path: output + "/cup-retouched-" + colour + ".png" });
        }
        const detailFigures = page.locator("[data-cup-full-details] figure");
        assert.equal(await detailFigures.count(), 17, "Every source product-detail image is present");
        for (let index = 0; index < 17; index++) {
          const figure = detailFigures.nth(index);
          const id = String(index + 1).padStart(2, "0");
          assert.equal(await figure.getAttribute("data-cup-detail"), id, "Original detail order is preserved");
          assert.ok((await figure.locator("figcaption").innerText()).length > 20, "Every detail has localized accessible copy");
          const image = figure.locator("img");
          await image.scrollIntoViewIfNeeded();
          await page.waitForFunction(id => { const image = document.querySelector('[data-cup-detail="' + id + '"] img'); return image?.complete && image.naturalWidth === 790 && image.naturalHeight === Number(image.getAttribute("height")); }, id);
          assert.ok(await image.evaluate(el => Math.abs(el.clientWidth / el.clientHeight - el.naturalWidth / el.naturalHeight) < 0.01), "The complete image is displayed without cropping");
        }
        assert.equal(await page.locator('[data-cup-holder-product] dl > div').count(), 17);
        await page.locator("#source-details").evaluate(el => el.scrollIntoView({ behavior: "instant", block: "start" }));
        await page.screenshot({ path: output + "/cup-holder-details-" + locale + "-" + device + ".png" });
        await page.locator('[data-cup-holder-product] dl').scrollIntoViewIfNeeded();
        await page.screenshot({ path: output + "/cup-holder-specs-" + locale + "-" + device + ".png" });
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        assert.equal(await page.locator('[data-cup-holder-product] a[href*="checkout"],[data-cup-holder-product] a[href*="reserve"]').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Cup holder fits viewport");
        await page.screenshot({ path: output + "/cup-holder-top-" + locale + "-" + device + ".png" });
        assert.deepEqual(errors, []);
        report.checks.push(locale + " " + device + ": visible L7/L1 top links, four mobile models fit, L7 navigation/gallery/specs/locale, accessory catalog link, original video playback/seeking/end/byte ranges, all five main photos/six colours/17 ordered uncropped detail images/source specs and responsive width");
      } finally { await context.close(); }
    }
  }
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack || error.message : String(error));
  throw error;
} finally {
  await browser.close();
  await writeFile(output + "/new-products-browser-report.json", JSON.stringify(report, null, 2) + "\n");
}
