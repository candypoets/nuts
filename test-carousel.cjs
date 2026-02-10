const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true, // For local dev server with self-signed cert
  });
  const page = await context.newPage();
  
  // Set viewport to desktop size
  await page.setViewportSize({ width: 1280, height: 800 });
  
  console.log('Navigating to https://befree:5173/explore...');
  try {
    await page.goto('https://befree:5173/explore', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
  } catch (e) {
    console.log('Navigation error:', e.message);
    // Try http instead
    console.log('Trying http://localhost:5173/explore...');
    await page.goto('http://localhost:5173/explore', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
  }
  
  // Wait a bit for animations
  await page.waitForTimeout(2000);
  
  // Take screenshot of initial state
  await page.screenshot({ path: '/root/code/nuts-cash/carousel-initial.png', fullPage: true });
  console.log('Initial screenshot saved to carousel-initial.png');
  
  // Get info about the carousel items
  const items = await page.$$('[data-carousel-item]');
  console.log(`Found ${items.length} carousel items`);
  
  // Get computed styles for each item
  const itemInfo = await page.evaluate(() => {
    const items = document.querySelectorAll('[data-carousel-item]');
    return Array.from(items).map((item, i) => {
      const style = window.getComputedStyle(item);
      const rect = item.getBoundingClientRect();
      return {
        index: i,
        zIndex: style.zIndex,
        transform: style.transform,
        opacity: style.opacity,
        position: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        overflow: style.overflow,
        overflowX: style.overflowX,
        overflowY: style.overflowY
      };
    });
  });
  
  console.log('\nCarousel items state:');
  itemInfo.forEach(info => console.log(JSON.stringify(info, null, 2)));
  
  // Check if body/html has horizontal scrolling
  const scrollInfo = await page.evaluate(() => {
    return {
      body: {
        scrollWidth: document.body.scrollWidth,
        clientWidth: document.body.clientWidth,
        overflowX: window.getComputedStyle(document.body).overflowX
      },
      html: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        overflowX: window.getComputedStyle(document.documentElement).overflowX
      },
      window: {
        innerWidth: window.innerWidth,
        scrollX: window.scrollX
      }
    };
  });
  
  console.log('\nScroll info:', JSON.stringify(scrollInfo, null, 2));
  
  // Try scrolling horizontally
  console.log('\nTrying to scroll horizontally...');
  await page.evaluate(() => {
    window.scrollBy(500, 0);
  });
  await page.waitForTimeout(500);
  
  const afterScroll = await page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY
  }));
  console.log('After scroll:', afterScroll);
  
  await page.screenshot({ path: '/root/code/nuts-cash/carousel-after-scroll.png', fullPage: true });
  console.log('After scroll screenshot saved to carousel-after-scroll.png');
  
  await browser.close();
})();
