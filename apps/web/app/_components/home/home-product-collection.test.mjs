import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./home-page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./original-home.module.css", import.meta.url), "utf8");
const catalogs = ["zh", "de", "en"].map(locale => JSON.parse(readFileSync(new URL("../../_lib/i18n/catalog/" + locale + ".json", import.meta.url), "utf8")));

test("official homepage keeps the brand hero and shows the collection grid before editorial sections", () => {
  assert.match(page, /<HomePosterHero/);
  assert.match(page, /data-home-product-collection/);
  assert.ok(page.indexOf('data-home-product-collection') < page.indexOf('<section id="folding"'));
  assert.match(page, /id="featured"/);
});

test("homepage product cards use existing ALSVID models and detail routes", () => {
  for (const code of ["A1-ULTRA", "L1-PRO", "A1", "L1"]) assert.match(page, new RegExp('code: "' + code + '"'));
  for (const slug of ["fc1", "fc2", "l7", "l8"]) assert.match(page, new RegExp('detail\\("' + slug + '"\\)'));
  assert.match(page, /catalog\.bikes\.models\.details/);
  assert.doesNotMatch(page, /<L8LaunchCard|<L7LaunchCard|<Fc2LaunchCard/);
});

test("homepage collection has the same responsive image-card layout and complete locale labels", () => {
  assert.match(styles, /\.home-product-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media\(max-width:700px\)/);
  for (const catalog of catalogs) {
    for (const key of ["catalog.bikes.models.kicker", "catalog.bikes.models.title", "catalog.bikes.models.body", "catalog.bikes.models.details", "catalog.nav.bikes"]) {
      assert.equal(typeof catalog[key], "string", key);
      assert.ok(catalog[key].length > 0, key);
    }
  }
});


test("home cards retain a three-column desktop grid, with a legible single-column phone layout", () => {
  assert.match(styles, /\.home-product-image\{aspect-ratio:4\/3;/);
  assert.match(styles, /\.home-product-info h3\{margin:0;font-size:/);
  assert.match(styles, /@media\(max-width:600px\)\{[\s\S]*?\.home-product-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(styles, /\.home-product-collection a:focus-visible/);
  assert.match(page, /<HomePosterHero/);
});


test("homepage model bindings compare the renamed model codes, not retired labels", () => {
  const source = readFileSync(new URL("./public-product-bindings.ts", import.meta.url), "utf8");
  assert.match(source, /FC1_HERO:'A1-ULTRA',FC1_FEATURED:'A1-ULTRA',FC2_LAUNCH:'L1-PRO'/);
  assert.doesNotMatch(source, /FC1_HERO:'FC1'|FC2_LAUNCH:'FC2'/);
});
