import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Reuse the temporary Playwright installation already provisioned by fc1-preview.yml.
const root = process.env.FC1_PLAYWRIGHT_ROOT;
if (!root) throw new Error('FC1_PLAYWRIGHT_ROOT is required: this check runs within the existing browser-preview workflow');
const { chromium } = createRequire(root + '/package.json')('playwright');
const base = (process.env.FC1_REVIEW_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const output = process.env.FC1_REVIEW_OUTPUT || '.tmp/fc1-v4-review';
const report = { sha: process.env.FC1_REVIEW_SHA || '', base, checks: [], errors: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  // Initial locale follows the forwarded visitor IP, never browser language.
  const entryContext = await browser.newContext();
  try {
    for (const [ip, locale] of [['194.25.2.129', 'de'], ['193.170.1.1', 'de'], ['114.114.114.114', 'zh'], ['8.8.8.8', 'en'], ['2001:4860:4860::8888', 'en'], ['', 'de']]) {
      for (const saved of [undefined, 'invalid', 'de', 'en', 'zh']) {
        const response = await entryContext.request.get(base + '/', {
          headers: { host: 'www.alsvidbike.com', 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'x-forwarded-for': ip,
            ...(saved ? { cookie: 'alsvid-locale-v2=' + saved } : {}) },
          maxRedirects: 0,
        });
        const expected = ['de', 'en', 'zh'].includes(saved) ? saved : locale;
        assert.equal(response.status(), 307, 'Root entry redirects to a localized homepage');
        assert.equal(response.headers().location, '/' + expected + '/', 'Explicit choice precedes IP country');
      }
    }
    const page = await entryContext.newPage();
    await page.goto(base + '/de/', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('lang'), 'de');
    await page.locator('main[data-home-design="original-migration"]').waitFor({ state: 'visible' });
    report.checks.push('Root entry: DE/AT/CN/US/IPv6 country routing, unknown IP German fallback, explicit DE/EN/ZH override');
  } finally { await entryContext.close(); }

  // Hold the next optimized image to reproduce a slow first visit without hiding
  // the problem behind image.decode() immediately before the screenshot.
  const carouselContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  let releaseCity;
  const cityBlocked = new Promise(resolve => { releaseCity = resolve; });
  try {
    await carouselContext.route('**/_next/image?*', async route => {
      if (new URL(route.request().url()).searchParams.get('url') === '/home/original/scene-city.webp') {
        await cityBlocked;
      }
      await route.continue();
    });
    const page = await carouselContext.newPage();
    const cityRequest = page.waitForRequest(request =>
      new URL(request.url()).searchParams.get('url') === '/home/original/scene-city.webp', { timeout: 15000 });
    await page.goto(base + '/en/', { waitUntil: 'domcontentloaded' });
    const hero = page.locator('[data-home-carousel]');
    const tabs = hero.locator('[role="group"] button[aria-pressed]');
    await hero.locator('img').first().evaluate(image => image.decode());
    await cityRequest;
    await tabs.nth(1).click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await tabs.nth(0).getAttribute('aria-pressed'), 'true', 'Keep the current KV selected while its successor loads');
    const stillVisible = await hero.locator('img').first().evaluate(image => ({
      source: image.currentSrc || image.src, ready: image.complete && image.naturalWidth > 0,
    }));
    assert.ok(stillVisible.ready && stillVisible.source.includes('fc1-poster-clean.png'),
      'A delayed next image must never replace the loaded KV with an empty background');
    await page.screenshot({ path: output + '/homepage-carousel-loading-next.png' });
    releaseCity();
    await page.waitForFunction(() =>
      document.querySelector('[data-home-carousel] [role="group"] button:nth-child(2)')?.getAttribute('aria-pressed') === 'true');
    // Routed browser tests disable the HTTP cache, so the displayed img may make
    // another request even after the detached preloader decoded the same URL.
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-home-carousel] img');
      return image?.complete && image.naturalWidth > 0 && image.currentSrc.includes('scene-city.webp');
    });
    const nextImage = await hero.locator('img').first().evaluate(image => ({
      source: image.currentSrc || image.src, ready: image.complete && image.naturalWidth > 0,
    }));
    assert.ok(nextImage.ready && nextImage.source.includes('scene-city.webp'), 'Switch to the next KV only after it is decoded');
    await page.screenshot({ path: output + '/homepage-carousel-delayed-image.png' });
    report.checks.push('Homepage KV: delayed image retains the loaded poster, then switches after decode');
  } finally {
    releaseCity();
    await carouselContext.close();
  }

  for (const locale of ['de', 'en', 'zh']) {
    for (const [device, viewport] of [
      ['desktop', { width: 1440, height: 900 }],
      ['mobile', { width: 390, height: 844 }],
      ['compact-mobile', { width: 320, height: 720 }],
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        const browserErrors = [];
        page.on('pageerror', error => browserErrors.push(error.message));
        const response = await page.goto(base + '/' + locale + '/', { waitUntil: 'domcontentloaded' });
        assert.equal(response?.status(), 200, locale + ' homepage should return HTTP 200');
        const root = page.locator('main[data-home-design="original-migration"]');
        await root.waitFor({ state: 'visible', timeout: 15000 });
        await root.locator('header').first().waitFor({ state: 'attached' });

        const isMobile = device !== 'desktop';
        const headerNav = isMobile
          ? root.locator('header > details').first()
          : root.locator('header > nav').first();
        if (isMobile) await headerNav.locator('summary').click();
        const navLinks = isMobile
          ? headerNav.locator(':scope > nav > a:not([data-site-cart]), :scope > nav > button[class*="mobileLink"]')
          : headerNav.locator(':scope > a, :scope > button[class*="navLink"]');
        assert.equal(await navLinks.count(), 8, 'Approved product/dealer/owner/story navigation exists');
        assert.equal(await root.locator('header [data-site-cart]').count(),2,'Desktop and mobile shopping-bag entries coexist');
        assert.equal(await navLinks.nth(0).getAttribute('href'), '/' + locale + '/explore/fc1', 'FC1 must come before FC2');
        assert.equal(await navLinks.nth(1).getAttribute('href'), '/' + locale + '/explore/fc2', 'FC2 model links to its own page');
        assert.equal(await navLinks.nth(2).getAttribute('href'), '/' + locale + '/explore/l7', 'L7 has a global model entry');
        assert.equal(await navLinks.nth(3).getAttribute('href'), '/' + locale + '/explore/l1', 'L8 has a global model entry');
        assert.equal(await navLinks.nth(4).getAttribute('href'), '/' + locale + '/bikes', 'Products link to bicycle catalog');
        assert.equal(await navLinks.nth(5).getAttribute('href'), '/' + locale + '/dealers', 'Dealers follow the unified product center');
        const dealerLabel = { de: 'Händler weltweit', en: 'Global dealers', zh: '全球经销商' }[locale];
        const ownerLabel = { de: 'Service', en: 'Owner services', zh: '车主服务' }[locale];
        assert.equal((await navLinks.nth(5).innerText()).trim(), dealerLabel, 'Global dealers follow the unified product center');
        assert.equal((await navLinks.nth(6).innerText()).trim(), ownerLabel, 'Owner services follows global dealers');
        assert.equal(await navLinks.nth(7).getAttribute('href'), '/' + locale + '/explore/about-story', 'Brand story follows owner services');
        assert.equal(await navLinks.nth(6).getAttribute('aria-haspopup'), 'dialog', 'Owner services opens a choice dialog');
        await navLinks.nth(6).click();
        const ownerDialog = page.getByRole('dialog');
        await ownerDialog.waitFor({ state: 'visible' });
        assert.ok(await ownerDialog.locator('a[href="/' + locale + '/service-locations"]').count(), 'Service option stays on verified public service directory');
        const ownerHref = await ownerDialog.locator('a').first().getAttribute('href');
        const ownerDestination = new URL(ownerHref, base);
        const publicOwnerPortal = ownerDestination.hostname === 'my.alsvidbike.com';
        const localOwnerPortal = ['127.0.0.1', 'localhost'].includes(ownerDestination.hostname) && ownerDestination.pathname === '/my';
        assert.ok(publicOwnerPortal || localOwnerPortal,
          'Owner option leads to My ALSVID in production and preserves the local /my portal route in browser previews');
        await ownerDialog.locator('button').first().click();
        await ownerDialog.waitFor({ state: 'hidden' });
        const reserveBadge = navLinks.nth(0).locator('span');
        const newBadge = navLinks.nth(1).locator('span');
        assert.ok((await reserveBadge.innerText()).trim(), 'FC1 reservation badge is localized');
        assert.ok((await newBadge.innerText()).trim(), 'FC2 new badge is localized');
        assert.equal(await reserveBadge.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(184, 233, 134)');
        assert.equal(await newBadge.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(230, 83, 75)');
        if (!isMobile) {
          assert.equal(await navLinks.nth(0).evaluate(element => getComputedStyle(element).fontSize), '18px');
        } else {
          assert.equal(await headerNav.locator('nav a[hreflang]').count(), 3, 'All language options remain accessible inside Menu');
          await headerNav.locator('summary').click();
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Navigation must not cause horizontal overflow');
        const bicycles = await context.newPage();
        const bicyclesResponse = await bicycles.goto(base + '/' + locale + '/bikes', { waitUntil: 'domcontentloaded' });
        assert.equal(bicyclesResponse?.status(), 200, locale + ' bicycle catalog should return HTTP 200');
        assert.equal(await bicycles.locator('main[data-bikes-catalog]').count(), 1, 'Bicycle catalog renders');
        assert.equal(await bicycles.locator('a[href="/' + locale + '/explore/fc1"]').count() > 0, true, 'FC1 detail link exists');
        assert.equal(await bicycles.locator('a[href="/' + locale + '/explore/fc2"]').count() > 0, true, 'FC2 detail link exists');
        assert.equal(await bicycles.locator('a[href="/' + locale + '/explore/l7"]').count() > 0, true, 'L7 detail link exists');
        assert.equal(await bicycles.locator('a[href="/' + locale + '/explore/l1"]').count() > 0, true, 'L8 detail link exists');
        assert.equal(await bicycles.locator('#models article').count(), 4, 'The catalogue includes FC1, FC2, L7 and L8 model previews');
        const quickModels=bicycles.locator('nav[data-bikes-quick-models]');
        assert.equal(await quickModels.count(),1,'Bike catalogue includes the model image shortcut strip');
        assert.equal(await quickModels.locator('a[data-quick-model]').count(),4,'Quick model strip uses published or visible catalogue records only');
        assert.equal(await quickModels.locator('a[data-quick-model="fc2"]').getAttribute('href'),'/'+locale+'/bikes?platform=fc#model-fc2');
        assert.equal(await bicycles.locator('[data-bikes-facts]').count(),2,'Reference specification tiles appear only for documented FC1 and FC2 models');
        assert.equal(await bicycles.locator('[data-bikes-price-pending]').count(),4,'No invented sale prices or discounts');
        assert.ok(await bicycles.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1),
          'Model shortcut strip fits the viewport');

        const help=bicycles.locator('[data-bikes-help]');
        assert.equal(await help.locator('details').count(),3,'Collection answers purchase, colour and reference-spec questions');
        for (const question of await help.locator('details').all()) {
          await question.locator('summary').click();
          assert.equal(await question.getAttribute('open'),'','Native FAQ disclosure opens with localized copy');
          assert.ok((await question.locator('p').innerText()).trim());
          await question.locator('summary').click();
        }
        assert.equal(await help.locator('a[href="/'+locale+'/dealers"]').count(),1);
        assert.equal(await help.locator('a[href="/'+locale+'/service-locations"]').count(),1);
        const discovery = bicycles.locator('[data-bikes-discovery]');
        assert.equal(await discovery.count(), 1, 'Model discovery component renders for FC platform');
        const firstBikeSrc = await discovery.locator('#model-fc1 img').getAttribute('src');
        const swatches = discovery.locator('[data-bikes-color-preview] button');
        assert.equal(await swatches.count(), 4, 'FC1 offers one real sample and three explicitly proposed swatches');
        await swatches.nth(1).click();
        assert.equal(await swatches.nth(1).getAttribute('aria-pressed'), 'true', 'Proposal swatch can be selected');
        assert.equal(await discovery.locator('#model-fc1 img').getAttribute('src'), firstBikeSrc,
          'Proposal selection must not impersonate a real bike photograph');
        // Storefront-style quick view is real UI, while actual purchase remains gated.
        assert.equal(await discovery.locator('button[data-bikes-quick-view]').count(), 4,
          'Every visible bike has a quick-view action');
        await discovery.locator('button[data-bikes-quick-view="fc1"]').click();
        const quick=bicycles.locator('dialog[data-bikes-quick-dialog]');
        await quick.waitFor({state:'visible'});
        assert.equal(await quick.locator('button[data-bikes-quick-save]').count(),1,
          'FC1 quick view allows a preview selection, not checkout');
        assert.equal(await quick.locator('[data-bikes-quick-facts] dd').count(),2,'Quick view shows the same reference wheel and frame facts as the card');
        assert.equal(await quick.locator('select').count(),3,'FC1 quick view exposes variant, finish and quantity');
        await quick.locator('select').nth(0).selectOption('pro');
        await quick.locator('select').nth(1).selectOption('blue');
        await quick.locator('select').nth(2).selectOption('2');
        await quick.locator('button[data-bikes-quick-save]').click();
        await bicycles.waitForFunction(()=>{
          const raw=localStorage.getItem('alsvid_storefront_cart_preview_v1');
          const items=raw?JSON.parse(raw).items:[];
          return items?.length===1 && items[0].product==='FC1' &&
            items[0].model==='pro' && items[0].colour==='blue' && items[0].quantity===2;
        });
        assert.equal(await quick.locator('button[data-bikes-quick-save]').count(),1,
          'Only local cart selection is offered, not a payment button');
        await quick.locator('button').first().click();
        await quick.waitFor({state:'hidden'});
        await discovery.locator('button[data-bikes-quick-view="l7"]').click();
        await quick.waitFor({state:'visible'});
        assert.equal(await quick.locator('button[data-bikes-quick-save]').count(),0,
          'Unverified concept bikes cannot be added to the cart');
        await quick.locator('button').first().click();
        await quick.waitFor({state:'hidden'});
        // Isolate existing FC1/cart smoke: its new page begins with an empty store.
        await bicycles.evaluate(()=>localStorage.removeItem('alsvid_storefront_cart_preview_v1'));

        const tray = bicycles.locator('[data-bikes-compare-tray]');
        assert.equal(await tray.count(), 0, 'Comparison starts with the visitor choosing models');
        for (const code of ['A1-ULTRA', 'L1-PRO', 'A1']) {
          await discovery.locator('[data-bikes-compare-toggle="' + code + '"]').click();
        }
        await tray.waitFor({state:'visible'});
        assert.equal(await tray.locator('[data-bikes-compare-remove]').count(),3,'Tray retains three chosen models');
        assert.ok(await bicycles.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Three selected comparison models do not overflow the page');
        await discovery.locator('[data-bikes-compare-toggle="L1"]').click();
        assert.equal(await tray.locator('[data-bikes-compare-remove]').count(),3,'Fourth model does not exceed comparison limit');
        assert.ok((await tray.locator('[role="status"]').allTextContents()).some(text=>text.trim()),'Comparison feedback is visible near the selected models');
        await tray.locator('[data-bikes-compare-remove="A1"]').click();
        assert.equal(await discovery.locator('[data-bikes-compare] table thead th').count(),3,'Removing from tray updates table');
        assert.equal(await discovery.locator('[data-bikes-compare] thead img').count(),2,'Comparison includes model photographs');
        await tray.locator('a[href="#bikes-compare"]').click();
        await bicycles.waitForFunction(()=>location.hash==='#bikes-compare' && document.activeElement?.id==='bikes-compare');
        await bicycles.waitForFunction(()=>{
          const top=document.getElementById('bikes-compare')?.getBoundingClientRect().top;
          return top!==undefined && top>=130 && top<=170;
        });
        const trayBox=await tray.boundingBox();
        assert.ok(trayBox && trayBox.x>=0 && trayBox.x+trayBox.width<=viewport.width+1 && trayBox.y>=0 && trayBox.y+trayBox.height<=viewport.height+1,'Comparison tray fits the viewport');
        await bicycles.screenshot({path:output+'/bikes-compare-'+locale+'-'+device+'.png'});
        const bikeSearch = discovery.locator('input[data-bikes-search]');
        await bikeSearch.fill('L1-PRO');
        assert.equal(await bicycles.locator('#models article').count(),1,'Search filters visible models');
        assert.equal(await tray.locator('[data-bikes-compare-remove]').count(),2,'Search does not silently remove selected models');
        await discovery.locator('[data-bikes-reset]').click();
        assert.equal(await bicycles.locator('#models article').count(),4,'Reset restores all models even when search had results');
        await bikeSearch.fill('no-such-alsvid-model');
        assert.equal(await bicycles.locator('#models article').count(),0,'Unmatched search shows the empty state');
        await discovery.locator('[data-bikes-reset]').click();
        assert.equal(await bicycles.locator('#models article').count(),4,'Reset recovers from empty search');
        await tray.locator('[data-bikes-compare-clear]').click();
        assert.equal(await tray.count(),0,'Clear selection removes floating tray');
        assert.equal(await discovery.locator('[data-bikes-compare] table').count(),0,'Clear selection also clears comparison table');
        report.checks.push(locale + ' ' + device + ': model search, swatches, compare selection');
        const modelNavigator = bicycles.locator('nav[data-bikes-model-nav]');
        await modelNavigator.waitFor({ state: 'visible', timeout: 8000 });
        assert.equal(await modelNavigator.count(), 1, 'Sticky category navigation is present from the top of the page');
        assert.equal(await modelNavigator.locator('a').count(), 3, 'Sticky category navigation links to models, platforms and accessories');
        const modelSideNavigator = bicycles.locator('nav[data-bikes-model-side-nav]');
        assert.equal(await modelSideNavigator.count(), 1, 'Model series appear in the left-side in-flow index');
        assert.equal(await modelSideNavigator.locator('a').count(), 4, 'Left model index links to FC1, FC2, L7 and L8');
        assert.equal(await modelNavigator.evaluate(element => getComputedStyle(element).position), 'sticky',
          'Product navigation stays in the document flow and sticks below the global header');
        assert.equal(await bicycles.locator('header[data-public-site-header]').evaluate(element => getComputedStyle(element).position), 'sticky',
          'Global header and cart remain visible while scrolling');
        await modelSideNavigator.locator('a[data-nav-target="model-fc1"]').click();
        await bicycles.waitForFunction(() => location.hash === '#model-fc1' && new URLSearchParams(location.search).get('platform') === 'fc');
        await bicycles.waitForFunction(() =>
          document.querySelector('nav[data-bikes-model-side-nav] a[data-nav-target="model-fc1"]')?.getAttribute('aria-current') === 'location');
        await modelSideNavigator.locator('a[data-nav-target="model-fc2"]').click();
        await bicycles.waitForFunction(() => location.hash === '#model-fc2');
        await bicycles.waitForFunction(() =>
          document.querySelector('nav[data-bikes-model-side-nav] a[data-nav-target="model-fc2"]')?.getAttribute('aria-current') === 'location');
        await bicycles.waitForFunction(() => {
          const header = document.querySelector('header[data-public-site-header]')?.getBoundingClientRect();
          const nav = document.querySelector('nav[data-bikes-model-nav]')?.getBoundingClientRect();
          const target = document.querySelector('#model-fc2')?.getBoundingClientRect();
          return Boolean(header && nav && target &&
            Math.abs(header.top) < 1 &&
            Math.abs(nav.top - header.bottom) < 2 &&
            target.top >= 110 && target.top <= 165);
        }, { timeout: 8000 });
        assert.ok(await bicycles.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          'Sticky product navigation fits the viewport');
        await bicycles.screenshot({ path: output + '/bikes-nav-' + locale + '-' + device + '.png' });

        assert.ok(await bicycles.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Bicycle catalog should not overflow at ' + device);
        const gtResponse = await bicycles.goto(base + '/' + locale + '/bikes?platform=gt#models', { waitUntil: 'domcontentloaded' });
        assert.equal(gtResponse?.status(), 200, 'Platform filter loads');
        assert.equal(await bicycles.locator('#models article').count(), 0, 'Unconfirmed GT bikes do not appear as real listings');
        assert.equal(await bicycles.locator('nav[data-bikes-model-nav] a').count(), 3, 'The sticky category navigation remains available');
        assert.equal(await bicycles.locator('nav[data-bikes-model-side-nav] a').count(), 4, 'The left model index remains available when a platform has no models');
        await bicycles.close();
        // The public catalog has a single product center with two categories.
        const accessories = await context.newPage();
        const accessoriesResponse = await accessories.goto(base + '/' + locale + '/accessories', {waitUntil:'domcontentloaded'});
        assert.equal(accessoriesResponse?.status(), 200, 'Legacy accessories URL redirects to a live product center');
        assert.equal(new URL(accessories.url()).pathname, '/' + locale + '/bikes', 'Legacy accessories route has no separate visual page');
        assert.equal(await accessories.locator('section[data-accessories-catalog="1"]').count(), 1, 'Combined product center renders accessories');
        assert.equal(await accessories.locator('section[data-accessories-catalog="1"] article').count(), 5, 'Product center includes five accessory categories');
        assert.equal(await accessories.locator('main[data-bikes-catalog="1"]').count(), 1, 'Accessories are under the shared products page');
        assert.equal(await accessories.locator('header a[href="/' + locale + '/accessories"]').count(), 0, 'Separate accessories top-level nav is removed');
        const rackResponse = await accessories.goto(base + '/' + locale + '/accessories?category=rack', {waitUntil:'domcontentloaded'});
        assert.equal(rackResponse?.status(), 200, 'Legacy category filter redirects successfully');
        assert.equal(new URL(accessories.url()).pathname, '/' + locale + '/bikes');
        assert.equal(new URL(accessories.url()).searchParams.get('category'), 'rack', 'Legacy filters are preserved');
        assert.equal(await accessories.locator('section[data-accessories-catalog="1"] article').count(), 1, 'Rack filter shows only its category');
        assert.ok(await accessories.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Merged product center has no horizontal overflow');
        await accessories.close();

        // Cart phase one: the configured FC1 selection survives navigation, but cannot be purchased.
        const shopping=await context.newPage();
        const cartResponse=await shopping.goto(base+'/'+locale+'/cart',{waitUntil:'domcontentloaded'});
        assert.equal(cartResponse?.status(),200,'Cart is a real accessible page');
        assert.equal(await shopping.locator('main[data-storefront-cart="cart"]').count(),1);
        assert.equal(await shopping.locator('main[data-storefront-cart="cart"] article').count(),0,'Empty cart starts with zero lines');
        await shopping.goto(base+'/'+locale+'/explore/fc1#configure',{waitUntil:'domcontentloaded'});
        const purchase=shopping.locator('[data-product-purchase="fc1"]');
        await purchase.waitFor({state:'visible',timeout:15000});
        assert.equal(await purchase.locator('button').count(),2,'Detail page exposes add and buy controls');
        assert.equal(await purchase.locator('button').nth(1).isDisabled(),true,'Buy now is gated until PSP, SKU and price readiness');
        await purchase.locator('button').first().click();
        await purchase.locator('a[href="/'+locale+'/cart"]').waitFor({state:'visible'});
        await shopping.waitForFunction(() => {
          const badges = [...document.querySelectorAll('header [data-site-cart] strong')];
          return badges.length === 2 && badges.every(node => node.textContent?.trim() === '1');
        });
        const cartWithItem=await shopping.goto(base+'/'+locale+'/cart',{waitUntil:'domcontentloaded'});
        assert.equal(cartWithItem?.status(),200);
        await shopping.locator('main[data-storefront-cart="cart"] article').first().waitFor();
        assert.equal(await shopping.locator('main[data-storefront-cart="cart"] article').count(),1,'Configured FC1 persists into cart');
        await shopping.locator('main[data-storefront-cart="cart"] article button[aria-label]').last().click();
        await shopping.waitForFunction(()=>document.querySelector('main[data-storefront-cart="cart"] strong[aria-live="polite"]')?.textContent==="2");
        await shopping.waitForFunction(() => {
          const badges = [...document.querySelectorAll('header [data-site-cart] strong')];
          return badges.length === 2 && badges.every(node => node.textContent?.trim() === '2');
        });
        const checkoutResponse=await shopping.goto(base+'/'+locale+'/checkout',{waitUntil:'domcontentloaded'});
        assert.equal(checkoutResponse?.status(),200);
        // Checkout summary appears after client cart hydration; do not race the first DOM snapshot.
        await shopping.locator('main[data-storefront-cart="checkout"] button:disabled').waitFor({state:'visible',timeout:15000});
        assert.equal(await shopping.locator('main[data-storefront-cart="checkout"] button:disabled').count(),1,'No live payment is possible');
        assert.equal(await shopping.locator('main[data-storefront-cart="checkout"] article').count(),1,'Order preview retains chosen selection');
        await shopping.goto(base+'/'+locale+'/explore/fc2',{waitUntil:'domcontentloaded'});
        const fc2Selection=shopping.locator('[data-preview-selection="fc2"]');
        await fc2Selection.waitFor({state:'visible'});
        assert.equal(await fc2Selection.locator('button:disabled').count(),1,'FC2 buy now is blocked without approved price and SKU');
        await fc2Selection.locator('button:not(:disabled)').click();
        await shopping.waitForFunction(()=>{const badges=[...document.querySelectorAll('header [data-site-cart] strong')];return badges.length===2 && badges.every(node=>node.textContent?.trim()==='3');});
        await shopping.goto(base+'/'+locale+'/explore/accessory-basket',{waitUntil:'domcontentloaded'});
        const accessorySelection=shopping.locator('[data-preview-selection="accessory-basket"]');
        await accessorySelection.waitFor({state:'visible'});
        assert.equal(await accessorySelection.locator('button:disabled').count(),1,'Unverified accessory purchase stays disabled');
        await accessorySelection.locator('select').selectOption('2');
        await accessorySelection.locator('button:not(:disabled)').click();
        await shopping.waitForFunction(()=>{const badges=[...document.querySelectorAll('header [data-site-cart] strong')];return badges.length===2 && badges.every(node=>node.textContent?.trim()==='5');});
        await shopping.goto(base+'/'+locale+'/cart',{waitUntil:'domcontentloaded'});
        await shopping.locator('main[data-storefront-cart="cart"] article').first().waitFor();
        assert.equal(await shopping.locator('main[data-storefront-cart="cart"] article').count(),3,'Cart retains FC1, FC2 and accessory interests');
        assert.equal(await shopping.locator('article[data-cart-product="FC2"]').count(),1);
        assert.equal(await shopping.locator('article[data-cart-product="ACCESSORY"]').count(),1);
        assert.equal(await shopping.locator('main[data-storefront-cart="cart"] button:disabled').count(),2,'No payment and minimum quantity controls stay gated');
        await shopping.goto(base+'/'+locale+'/checkout',{waitUntil:'domcontentloaded'});
        // Wait for the client cart to hydrate before counting checkout line items;
        // DOMContentLoaded alone can observe the empty server shell transiently.
        await shopping.waitForFunction(()=>document.querySelectorAll('main[data-storefront-cart="checkout"] article').length===3,{timeout:15000});
        assert.equal(await shopping.locator('main[data-storefront-cart="checkout"] article').count(),3,'Unpriced mixed selections appear in checkout preview');
        assert.equal(await shopping.locator('main[data-storefront-cart="checkout"] button:disabled').count(),1,'Real checkout remains blocked');
        assert.ok(await shopping.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Cart and product pages do not overflow');
        report.checks.push(locale+' '+device+': FC1/FC2/accessory preview cart, quantity badge and disabled checkout');
        await shopping.close();


        const hero = root.locator(':scope > section').first();
        const mobileModels = root.locator('header > nav').nth(1);
        if (isMobile) {
          assert.ok(await mobileModels.isVisible(), 'All four model shortcuts must be visible in the top mobile header');
          const modelLinks = mobileModels.locator('a');
          assert.equal(await modelLinks.count(), 4, 'All four model shortcuts are visible outside the hamburger menu');
          assert.equal(await modelLinks.nth(0).getAttribute('href'), '/' + locale + '/explore/fc1');
          assert.equal(await modelLinks.nth(1).getAttribute('href'), '/' + locale + '/explore/fc2');
          assert.equal(await modelLinks.nth(2).getAttribute('href'), '/' + locale + '/explore/l7');
          assert.equal(await modelLinks.nth(3).getAttribute('href'), '/' + locale + '/explore/l1');
          assert.equal(await modelLinks.nth(0).locator('span').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(184, 233, 134)');
          assert.equal(await modelLinks.nth(1).locator('span').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(230, 83, 75)');
          const headerBox = await root.locator('header').first().boundingBox();
          const linkBox = await modelLinks.nth(0).boundingBox();
          const wordmarkBox = await root.locator('header a').first().boundingBox();
          const menuBox = await headerNav.locator('summary').boundingBox();
          assert.ok(headerBox && linkBox && wordmarkBox && menuBox && headerBox.height <= 70,
            'Header must be a single compact row, including logo and menu');
          assert.ok(Math.abs(wordmarkBox.y + wordmarkBox.height / 2 - linkBox.y - linkBox.height / 2) < 15 &&
            Math.abs(menuBox.y + menuBox.height / 2 - linkBox.y - linkBox.height / 2) < 15,
            'All model shortcuts must align horizontally with logo and Menu');
          const lastLinkBox = await modelLinks.nth(3).boundingBox();
          assert.ok(lastLinkBox && Math.abs(linkBox.y - lastLinkBox.y) < 4 &&
            linkBox.x >= wordmarkBox.x + wordmarkBox.width - 2 &&
            lastLinkBox.x + lastLinkBox.width <= menuBox.x + 2,
            'All four models fit between wordmark and Menu with no overlap');
          const heroTitleBox = await hero.locator('h1').boundingBox();
          assert.ok(heroTitleBox && headerBox && heroTitleBox.y > headerBox.y + headerBox.height,
            'Hero heading must clear the taller mobile header');
        } else {
          assert.equal(await mobileModels.isVisible(), false, 'Do not duplicate quick links on desktop');
        }
        const tabs = hero.locator('[role="group"] button[aria-pressed]');
        assert.equal(await tabs.count(), 4, 'Keep all four platform scenes');
        assert.equal(await tabs.nth(0).getAttribute('aria-pressed'), 'true', 'Initial scene is selected');
        const initialBackground = hero.locator('img').nth(0);
        const initialBackgroundInfo = await initialBackground.evaluate(async image => {
          await image.decode();
          return { source: image.currentSrc || image.src, width: image.naturalWidth, height: image.naturalHeight };
        });
        assert.ok(initialBackgroundInfo.source.includes('fc1-poster-clean.png'),
          'Initial homepage KV must show the owner-restored original person-and-bike poster');
        assert.ok(initialBackgroundInfo.width > 0 && initialBackgroundInfo.height > 0,
          'Restored first KV image must decode before visual review');
        assert.equal(await hero.locator('img').count(), 1,
          'The archived poster already contains the bicycle; do not superimpose a second bike');
        const approvedTitles = { zh: '接下来去哪里？', de: 'Wohin geht es als Nächstes?', en: 'Where to next?' };
        assert.equal((await hero.locator('h1').textContent())?.trim(), approvedTitles[locale],
          'Original journey headline must be displayed in the selected language');
        await page.screenshot({ path: output + '/official-homepage-initial-' + locale + '-' + device + '.png' });
        report.checks.push(locale + ' ' + device + ': restored original KV + journey headline');
        await tabs.nth(1).click();
        await page.waitForFunction(() =>
          document.querySelector('[data-home-carousel] [role="group"] button:nth-child(2)')?.getAttribute('aria-pressed') === 'true');
        assert.equal(await tabs.nth(1).getAttribute('aria-pressed'), 'true', 'Manual platform selection works');
        assert.equal(await tabs.nth(0).getAttribute('aria-pressed'), 'false', 'Previous scene is deselected');
        // Selection now commits only after decode; keep the image assertion before visual review.
        const activeHeroImage = hero.locator('img').first();
        const loadedHeroImage = await activeHeroImage.evaluate(async image => {
          await image.decode();
          return { width: image.naturalWidth, height: image.naturalHeight, source: image.currentSrc || image.src };
        });
        assert.ok(loadedHeroImage.width > 0 && loadedHeroImage.height > 0,
          'Selected homepage scene must have a successfully decoded image before visual review');
        assert.ok(loadedHeroImage.source.includes('scene-city.webp'),
          'Second homepage scene should load the city riding image');
        if (isMobile) {
          const copyTop = await hero.locator('h1').evaluate(element => Number.parseFloat(getComputedStyle(element.parentElement).top));
          const imagePosition = await activeHeroImage.evaluate(image => getComputedStyle(image).objectPosition);
          assert.ok(copyTop <= 70, 'Mobile hero copy should remain in the top safe area above the rider');
          assert.ok(imagePosition.startsWith('51%'), 'Mobile hero crop should preserve the full bicycle focal area');
        }
        assert.equal(await root.locator('[data-home-product-collection] article:has(a[href="/' + locale + '/explore/fc2"])').count(), 1,
          'FC2 remains discoverable in the homepage model collection');
        const title = hero.locator('h1');
        assert.ok((await title.innerText()).trim().length > 0, 'Hero retains readable headline');
        await page.screenshot({ path: output + '/official-' + locale + '-' + device + '.png' });
        assert.deepEqual(browserErrors, [], locale + ' ' + device + ' JS errors');
        const accessoryCatalogLinks = page.locator('a[data-accessories-catalog-link]');
        assert.equal(await accessoryCatalogLinks.count(), 2, 'Homepage and footer accessory overview links are present');
        assert.deepEqual(await accessoryCatalogLinks.evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))),
          ['/' + locale + '/bikes#accessories','/' + locale + '/bikes#accessories'],
          'Homepage accessory calls-to-action open the unified product and accessories catalogue');
        report.checks.push(locale + ' ' + device + ': homepage, navigation, four scenes, manual tab switching and catalogue entry');
      } finally {
        await context.close();
      }
    }
  }

  for (const locale of ['de','en','zh']) {
    for (const [device,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) {
      const context=await browser.newContext({viewport,reducedMotion:'reduce'});
      try {
        const page=await context.newPage();
        const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        const response=await page.goto(base+'/'+locale+'/explore/fc2',{waitUntil:'domcontentloaded'});
        assert.equal(response?.status(),200);
        const product=page.locator('main[data-fc2-product]');
        await product.waitFor({state:'visible'});
        assert.match(await product.locator('h1').innerText(),/L1 Pro/);
        await page.waitForFunction(()=>{const image=document.querySelector('[data-fc2-gallery] img');return image?.complete&&image.naturalWidth>0;});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'FC2 must fit '+device+' viewport');
        assert.ok(await page.locator('link[rel="canonical"]').getAttribute('href')=== 'https://www.alsvidbike.com/'+locale+'/explore/fc2');
        await page.screenshot({path:output+'/fc2-'+locale+'-'+device+'.png',fullPage:true});
        const gallery=product.locator('[data-fc2-gallery]');
        const controls=gallery.locator('button');
        await controls.nth(1).click();
        assert.equal(await controls.nth(1).getAttribute('aria-pressed'),'true');
        await gallery.locator('img[data-photo="folded"]').waitFor({state:'visible'});
        await page.waitForFunction(()=>{const image=document.querySelector('[data-photo="folded"]');return image?.complete&&image.naturalWidth>0;});
        await controls.nth(1).press('ArrowRight');
        assert.equal(await controls.nth(2).getAttribute('aria-pressed'),'true');
        assert.ok(await gallery.locator('img[data-photo="original"]').count()===1);
        const faq=product.locator('section').filter({has:page.locator('details')}).locator('details').first();
        await faq.locator('summary').click();
        assert.ok(await faq.evaluate(element=>element.open));
        const target=locale==='en'?'de':'en';
        if (device === 'desktop') {
          await product.locator('header details[class*="switcher"] summary').click();
        } else {
          await product.locator('header > details summary').click();
        }
        const languageLink=product.locator('header a[hreflang="'+target+'"]:visible').first();
        assert.equal(await languageLink.getAttribute('href'),'/'+target+'/explore/fc2');
        await languageLink.click();
        await page.waitForURL('**/'+target+'/explore/fc2');
        assert.ok((await context.cookies()).some(cookie=>cookie.name==='alsvid-locale-v2'&&cookie.value===target));
        assert.deepEqual(errors,[]);
        report.checks.push(locale+' '+device+': FC2 route, optimized images, responsive width, gallery click and keyboard, FAQ, canonical and preserved language route');
      } finally { await context.close(); }
    }
  }
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack || error.message : String(error));
  throw error;
} finally {
  await browser.close();
  await writeFile(output + '/official-homepage-report.json', JSON.stringify(report, null, 2) + '\n');
}
