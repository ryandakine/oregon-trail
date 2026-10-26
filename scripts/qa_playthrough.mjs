import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from 'serve-handler';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, '../public');
const SCREENSHOT_DIR = '/home/osi/.gemini/antigravity/brain/2d466ecf-95ad-49ea-b875-db8c0000a2f8/qa_screenshots';

async function main() {
  console.log('=== Starting Oregon Trail AI QA Playthrough ===');
  console.log(`Public directory: ${PUBLIC_DIR}`);
  console.log(`Screenshot directory: ${SCREENSHOT_DIR}`);

  // 1. Static server
  const server = createServer((req, res) => {
    handler(req, res, { public: PUBLIC_DIR });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Local test server listening at ${baseUrl}`);

  // 2. Playwright Chromium
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ],
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 960 },
    deviceScaleFactor: 2,
  });

  const pageErrors = [];
  const consoleWarnings = [];
  const consoleErrors = [];
  const networkRequests = [];

  page.on('pageerror', (err) => {
    console.error(`[PAGE ERROR] ${err.message}`);
    pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      console.error(`[CONSOLE ERROR] ${text}`);
      consoleErrors.push(text);
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(text);
    } else {
      if (text.includes('[OregonTrail') || text.includes('advance') || text.includes('scene')) {
        console.log(`[GAME LOG] ${text}`);
      }
    }
  });

  page.on('request', (req) => {
    if (req.url().includes('/api/')) {
      networkRequests.push({ url: req.url(), method: req.method() });
      console.log(`[API REQUEST] ${req.method()} ${req.url()}`);
    }
  });

  page.on('response', (res) => {
    if (res.url().includes('/api/')) {
      console.log(`[API RESPONSE] ${res.status()} ${res.url()}`);
    }
  });

  const snap = async (name) => {
    const file = path.join(SCREENSHOT_DIR, name);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`📸 Saved screenshot: ${name}`);
    return file;
  };

  try {
    // ── STEP 1: Title Screen ──
    console.log('\n--- Step 1: Loading Title Screen ---');
    await page.goto(`${baseUrl}/?test=1&llm=workers-ai`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.k && !!window.engine, { timeout: 15000 });
    await page.waitForTimeout(2000); // Allow Kaplay diorama & stars to boot
    await snap('01_title_screen.png');

    // ── STEP 2: Start Fresh -> Profession ──
    console.log('\n--- Step 2: Beginning Run -> Profession Selection ---');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#html-overlay.active', { timeout: 5000 });
    await page.waitForTimeout(600); // Wait for modal animation
    await snap('02_profession_selection.png');

    // ── STEP 3: Choose Farmer -> Names ──
    console.log('\n--- Step 3: Selecting Farmer -> Party Names Entry ---');
    await page.click('.profession-btn[data-prof="farmer"]');
    await page.waitForTimeout(600);
    await snap('03_names_entry.png');

    // ── STEP 4: Random Party -> Tone Tier ──
    console.log('\n--- Step 4: Randomizing Party -> Tone Tier Selection ---');
    await page.click('#name-random');
    await page.waitForTimeout(600);
    await snap('04_tone_selection.png');

    // ── STEP 5: Select Dark Frontier -> General Store ──
    console.log('\n--- Step 5: Selecting Dark Frontier (Medium) -> General Store ---');
    await page.click('.tone-btn[data-tone="medium"]');
    await page.waitForFunction(() => window.engine.state === 'STORE', { timeout: 15000 });
    await page.waitForTimeout(800);
    await snap('05_store_initial.png');

    // ── STEP 6: Recommend Supplies & Purchase ──
    console.log('\n--- Step 6: Setting Recommended Supplies & Purchasing ---');
    await page.click('#store-recommend');
    await page.waitForTimeout(500);
    await snap('06_store_purchases.png');
    await page.click('#store-buy');

    // ── STEP 7: Travel Scene Initial ──
    console.log('\n--- Step 7: Arriving at Travel Scene ---');
    await page.waitForFunction(() => window.engine.state === 'TRAVEL', { timeout: 15000 });
    // Pause auto-advance so we can inspect and test travel features without premature river transition
    await page.evaluate(() => window.engine.pauseAdvance());
    await page.waitForTimeout(1500); // Let wagon roll and prairie VFX spawn
    await snap('07_travel_active_hud.png');

    async function pressCanvasKey(key) {
      await page.evaluate((k) => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          canvas.focus();
          const isDigit = /^[0-9]$/.test(k);
          const code = k === ' ' ? 'Space' : isDigit ? ('Digit' + k) : ('Key' + k.toUpperCase());
          canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true }));
        }
      }, key);
      await page.keyboard.press(key);
    }

    // ── STEP 8: Test Zen Mode Fade & Activity Wake ──
    console.log('\n--- Step 8: Testing Zen Mode Fade (waiting 8 seconds of idle) ---');
    await page.waitForTimeout(7600);
    const zenOpacity = await page.evaluate(() => {
      const topHud = window.k.get('hud-top', { recursive: true })[0];
      const botHud = window.k.get('hud-bottom', { recursive: true })[0];
      return { top: topHud?.opacity, bottom: botHud?.opacity };
    });
    console.log(`Zen Mode Opacity: Top=${zenOpacity.top}, Bottom=${zenOpacity.bottom}`);
    await snap('10_zen_mode_faded.png');

    // Wake up HUD with mouse movement
    console.log('Waking Zen HUD with mouse movement...');
    await page.mouse.move(640, 480);
    await page.waitForTimeout(400);
    const wakeOpacity = await page.evaluate(() => {
      const topHud = window.k.get('hud-top', { recursive: true })[0];
      const botHud = window.k.get('hud-bottom', { recursive: true })[0];
      return { top: topHud?.opacity, bottom: botHud?.opacity };
    });
    console.log(`Woken Opacity: Top=${wakeOpacity.top}, Bottom=${wakeOpacity.bottom}`);
    await snap('11_zen_mode_woken.png');

    // ── STEP 9: Advance onto Trail (handling any event) ──
    console.log('\n--- Step 9: Advancing onto the Trail ---');
    await page.evaluate(async () => {
      window.engine.resumeAdvance();
      await window.engine.advance();
      window.engine.pauseAdvance();
    });
    await page.waitForTimeout(2000);

    let currentState = await page.evaluate(() => window.engine.state);
    console.log(`State after trail advance: ${currentState}, Miles: ${await page.evaluate(() => window.engine.milesTraveled)}`);

    if (currentState === 'EVENT') {
      console.log('Encountered historical event on advance! Resolving choice 1...');
      await snap('07b_event_modal.png');
      // Click first choice or press 1
      const choiceBtn = page.locator('.choice-btn, .overlay-choice').first();
      if (await choiceBtn.isVisible()) {
        await choiceBtn.click();
      } else {
        await pressCanvasKey('1');
      }
      await page.waitForTimeout(2000);
      // Click continue on result beat
      const contBtn = page.locator('.result-continue-btn, #result-continue, button:has-text("Continue")').first();
      if (await contBtn.isVisible()) {
        await contBtn.click();
      } else {
        await pressCanvasKey('c');
      }
      await page.waitForFunction(() => window.engine.state === 'TRAVEL', { timeout: 10000 });
      await page.evaluate(() => window.engine.pauseAdvance());
      await page.waitForTimeout(1000);
    }

    // ── STEP 10: Test Hunting Scene ──
    console.log('\n--- Step 10: Triggering Hunting Scene from Trail ---');
    await page.evaluate(() => window.engine.startHunt());
    await page.waitForFunction(() => window.engine.state === 'HUNTING', { timeout: 10000 });
    await page.waitForTimeout(1500); // Let prairie wildlife roam
    await snap('08_hunting_meadow.png');

    // Take a shot
    console.log('Taking careful shot in hunting meadow...');
    await pressCanvasKey('2'); // (2) Careful shot
    // Wait for hunt result to arrive from API
    await page.waitForFunction(() => {
      const texts = window.k.get('*').filter(o => o.text).map(o => o.text);
      return texts.some(t => t.includes('Press ENTER') || t.includes('rounds and got') || t.includes('Harvested'));
    }, { timeout: 15000 });
    await page.waitForTimeout(1000);
    await snap('09_hunting_result.png');

    // Return to travel
    console.log('Returning to travel scene...');
    await pressCanvasKey('c'); // (C) Continue
    await page.waitForFunction(() => window.engine.state === 'TRAVEL', { timeout: 10000 });
    await page.evaluate(() => window.engine.pauseAdvance());
    await page.waitForTimeout(1000);

    // ── STEP 11: Advance to Kansas River Crossing ──
    console.log('\n--- Step 11: Rolling Wagon to Kansas River Crossing ---');
    await page.evaluate(() => window.engine.resumeAdvance());
    let riverReached = false;
    for (let tick = 0; tick < 25; tick++) {
      const state = await page.evaluate(() => window.engine.state);
      if (state === 'RIVER') {
        riverReached = true;
        break;
      }
      if (state === 'EVENT') {
        console.log('Event encountered en route to river, resolving...');
        const choiceBtn = page.locator('.choice-btn, .overlay-choice').first();
        if (await choiceBtn.isVisible()) await choiceBtn.click();
        else await pressCanvasKey('1');
        await page.waitForTimeout(1500);
        const contBtn = page.locator('.result-continue-btn, #result-continue, button:has-text("Continue")').first();
        if (await contBtn.isVisible()) await contBtn.click();
        else await pressCanvasKey('c');
        await page.waitForTimeout(1000);
      }
      if (state === 'TRAVEL') {
        await page.evaluate(() => window.engine.advance());
      }
      await page.waitForTimeout(1500);
    }

    if (riverReached) {
      console.log('Kansas River crossing reached successfully!');
      await page.waitForTimeout(1500); // Allow water currents and foam to render
      await snap('12_river_crossing.png');

      // Attempt Caulk & Float
      console.log('Attempting to caulk wagon and float...');
      await pressCanvasKey('2'); // (2) Caulk wagon and float
      await page.waitForFunction(() => {
        const texts = window.k.get('*').filter(o => o.text).map(o => o.text);
        return texts.some(t => t.includes('Continue') || t.includes('caulked'));
      }, { timeout: 15000 }).catch(() => console.log('Wait for river resolved text timeout, proceeding...'));
      await page.waitForTimeout(1000);
      await snap('13_river_result_beat.png');

      // Continue back to trail
      console.log('Continuing from river crossing...');
      await pressCanvasKey('c');
      await page.waitForFunction(() => window.engine.state === 'TRAVEL', { timeout: 10000 });
      await page.waitForTimeout(1500);
      await snap('14_resumed_journey.png');
    } else {
      console.warn('Kansas River not reached within 20 advance ticks');
    }

    // ── STEP 11: Collect Performance & Engine Health Metrics ──
    console.log('\n--- Step 11: Collecting Health & Render Diagnostics ---');
    const diagnostics = await page.evaluate(() => {
      const k = window.k;
      const e = window.engine;
      return {
        state: e.state,
        milesTraveled: e.milesTraveled,
        currentDate: e.currentDate,
        aliveMembers: e.aliveMembers,
        supplies: e.supplies,
        lastLlmProvider: e.lastLlmProvider,
        sceneObjectCount: k.get('*').length,
        audioActive: !!window.audio,
        fps: Math.round(1 / k.dt()),
      };
    });

    console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));

    return {
      success: true,
      diagnostics,
      pageErrors,
      consoleErrors,
      consoleWarnings,
      networkRequests,
    };
  } finally {
    await browser.close();
    server.close();
  }
}

main().then((result) => {
  console.log('\n=== QA Playthrough Completed ===');
  console.log(`Page Errors: ${result.pageErrors.length}`);
  console.log(`Console Errors: ${result.consoleErrors.length}`);
  if (result.pageErrors.length > 0 || result.consoleErrors.length > 0) {
    process.exitCode = 1;
  }
}).catch((err) => {
  console.error('QA Playthrough failed with exception:', err);
  process.exitCode = 1;
});
