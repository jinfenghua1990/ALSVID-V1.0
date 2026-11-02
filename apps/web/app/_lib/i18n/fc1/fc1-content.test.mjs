import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const directory = path.dirname(fileURLToPath(import.meta.url));
const locales = Object.fromEntries(await Promise.all(["zh", "de", "en"].map(async (locale) => [
  locale,
  JSON.parse(await readFile(path.join(directory, `${locale}.json`), "utf8")),
])));

test("FC1 product copy has parity across all enabled WWW locales", () => {
  const expected = Object.keys(locales.en).sort();
  for (const [locale, catalog] of Object.entries(locales)) {
    assert.deepEqual(Object.keys(catalog).sort(), expected, `${locale} FC1 keys differ`);
    for (const [key, value] of Object.entries(catalog)) {
      assert.equal(typeof value, "string", `${locale}:${key} must be text`);
      assert.ok(value.trim().length > 0, `${locale}:${key} must not be empty`);
    }
  }
});

test("FC1 copy keeps unapproved variants, colours and compliance claims explicit", () => {
  for (const locale of ["zh", "de", "en"]) {
    const copy = locales[locale];
    assert.match(copy["fc1.spec.colour.value"], /待确认|未确认|nicht bestätigt|not confirmed|offen|pending|to confirm/i);
    assert.match(copy["fc1.spec.compliance.value"], /待确认|zu bestätigen|pending confirmation/i);
    assert.match(copy["fc1.config.belt.body"], /待确认|未确认|nicht bestätigt|not confirmed/i);
    assert.match(copy["fc1.colours.disclaimer"], /待确认|Bestätigung|nicht bestätigt|confirmation|unconfirmed/i);
  }
});

test("customer-facing FC1 source note omits the supplier brand and former model name", () => {
  for (const locale of ["zh", "de", "en"]) {
    assert.doesNotMatch(locales[locale]["fc1.source"], /naicisports|pilot\s*x9/i);
    assert.ok(locales[locale]["fc1.source.link"].trim().length > 0);
  }
});

test("FC1 keeps explicit email reservation and safe cart preview, with no live purchase", async () => {
  for (const [locale, copy] of Object.entries(locales)) {
    for (const key of ["fc1.reservation.cta", "fc1.reservation.pending", "fc1.reservation.note", "fc1.reservation.email_subject", "fc1.reservation.email_body"]) {
      assert.equal(typeof copy[key], "string", `${locale} missing ${key}`);
      assert.ok(copy[key].trim());
    }
    assert.doesNotMatch(copy["fc1.selection.unavailable"], /checkout|Warenkorb|购物袋/i);
  }
  const configurator = await readFile(path.join(directory, "../../../_components/product/fc1-colour-configurator.tsx"), "utf8");
  assert.match(configurator, /NEXT_PUBLIC_FC1_RESERVATION_EMAIL/);
  assert.match(configurator, /onSubmit=\{submitReservation\}/);
  assert.match(configurator, /\/api\/public\/fc1-reservation/);
  assert.match(configurator, /type="email"/);
  assert.match(configurator, /disabled=\{!reservationEmailConfigured/);
  assert.doesNotMatch(configurator, /mailto:/);
  assert.match(configurator, /fc1\.reservation\.pending/);
  assert.match(configurator, /addCartLine\(/);
  assert.match(configurator, /className=\{styles\.cartBuyButton\} disabled/);
  assert.doesNotMatch(configurator, /saveFc1PreviewCart|paymentIntent|createOrder|\/checkout/);
  for (const workflowPath of ["../../../../../../.github/workflows/production-deploy.yml", "../../../../../../.github/workflows/www-deploy.yml"]) {
    const workflow = await readFile(path.join(directory, workflowPath), "utf8");
    assert.match(workflow, /NEXT_PUBLIC_FC1_RESERVATION_EMAIL/);
    assert.match(workflow, /reservation_email_hash/);
  }
});

test("FC1 story and classic product layouts retain no direct paid checkout links", async () => {
  for (const file of ["../../../_components/product/fc1-product.tsx", "../../../_components/product/fc1-story-v4.tsx"]) {
    const source = await readFile(path.join(directory, file), "utf8");
    assert.equal(source.includes("ALSVID_SHOPIFY_FC1_PRODUCT_URL"), false);
    assert.equal(source.includes("shop.chaibenn.com"), false);
    assert.match(source, /fc1\.reservation\.note/);
    assert.equal(source.includes('href={`/${locale}/checkout'), false);
    assert.equal(source.includes('href={`/${locale}/cart'), false);
  }
});

test("cart and checkout now display selections but cannot take payment or create orders", async () => {
  const cart = await readFile(path.join(directory, "../../../[locale]/cart/page.tsx"), "utf8");
  const checkout = await readFile(path.join(directory, "../../../[locale]/checkout/page.tsx"), "utf8");
  const panel = await readFile(path.join(directory, "../../../_components/commerce/storefront-cart-panel.tsx"), "utf8");
  assert.match(cart, /StorefrontCartPanel/);
  assert.match(checkout, /StorefrontCartPanel/);
  assert.match(panel, /disabled className=\{styles\.disabledBuy\}/);
  assert.doesNotMatch(cart+checkout+panel, /paymentIntent|createOrder|paymentConfirmed|fetch\(|<form/);
});


test("FC1 public preview copy does not claim paid preorder, stock or Shopify checkout", async () => {
  for (const [locale, copy] of Object.entries(locales)) {
    assert.ok(copy["hero.poster_buy"].length > 0);
    assert.doesNotMatch(copy["hero.poster_buy"], /立即预订|Pre-order now|Jetzt vorbestellen/i, locale);
    assert.doesNotMatch(copy["fc1.faq.7.a"], /Shopify|checkout|在线购买已开放|Jetzt kaufen/i, locale);
    assert.ok(copy["fc1.selection.model_note"].length > 0);
  }
  const base = path.join(directory, "../");
  for (const locale of ["zh", "de", "en"]) {
    const globalCopy = JSON.parse(await readFile(path.join(base, locale + ".json"), "utf8"));
    assert.doesNotMatch(globalCopy["commerce.body"], /Shopify/i);
    assert.doesNotMatch(globalCopy["detail.accessory_body"], /Shopify/i);
  }
  const configurator = await readFile(path.join(directory, "../../../_components/product/fc1-colour-configurator.tsx"), "utf8");
  assert.match(configurator, /fetch\("\/api\/public\/fc1-colour-interest"/);
  assert.match(configurator, /const saveColourPreference = async \(\) =>/);
  assert.match(configurator, /onClick=\{\(\)=>void saveColourPreference\(\)\}/);
  assert.match(configurator, /productCode:"A1-ULTRA"/);
  assert.match(configurator, /window\.sessionStorage/);
  assert.match(configurator, /Preview choices|Browsing colours remains local/);
  assert.doesNotMatch(configurator, /useEffect\(\(\) => \{[^}]*saveColourPreference/s);
  assert.doesNotMatch(configurator, /copy\.soldOut|setSaveState|saveFc1PreviewCart/);
  assert.match(configurator, /copy\.proposal/);
  const css = await readFile(path.join(directory, "../../../_components/product/fc1-product.module.css"), "utf8");
  assert.match(css, /\.interestSpecs\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test("FC1 test-ride interest is localized and integrated within both purchase configurations", async () => {
  const required = [
    "cta", "helper", "title", "description", "selection", "close",
    "name", "name_placeholder", "country", "germany", "austria", "city",
    "city_placeholder", "email", "privacy", "availability", "submit",
    "sending", "failed", "pending", "no_booking", "sent_title", "sent_body",
  ];
  for (const [locale, catalog] of Object.entries(locales)) {
    for (const key of required) {
      assert.ok(catalog[`fc1.test_ride.${key}`], `${locale}: missing test ride field ${key}`);
    }
    assert.match(catalog["fc1.test_ride.availability"], /尚未|not.*confirm|noch keine|has been confirmed/i);
  }
  const base = path.join(directory, "../../../_components/product/");
  const component = await readFile(path.join(base, "fc1-test-ride.tsx"), "utf8");
  const story = await readFile(path.join(base, "fc1-colour-configurator.tsx"), "utf8");
  const classic = await readFile(path.join(base, "fc1-interactions.tsx"), "utf8");
  assert.match(component, /purpose: "test_ride"/);
  assert.match(component, /status === "sent"/);
  assert.match(component, /disabled=\{status === "sending"\}/);
  assert.match(story, /<Fc1TestRide locale=\{locale\}/);
  assert.match(classic, /<Fc1TestRide locale=\{locale\}/);
  assert.doesNotMatch(component, /\/checkout|createOrder|paymentIntent|mailto:/);
});
