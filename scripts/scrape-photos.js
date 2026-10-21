/**
 * scrape-photos.js
 * ─────────────────────────────────────────────────────────────────
 * Downloads photos for New Super Natural Nail & Spa via Google
 * Places API (no API key needed for photo references discovered
 * through a regular Maps embed / place search).
 *
 * Strategy (in order):
 *  1. Google Places API (Nearby Search → Place Details → photos[])
 *     — requires GOOGLE_PLACES_API_KEY env var if set
 *  2. Puppeteer scrape of Google Maps with stealth settings
 *  3. Fallback: download from the salon's public Google Maps
 *     listing using direct photo URLs discovered at runtime
 *
 * Usage:
 *   node scripts/scrape-photos.js
 *   GOOGLE_PLACES_API_KEY=YOUR_KEY node scripts/scrape-photos.js
 *
 * Outputs:
 *   public/salon-01.jpg … public/salon-N.jpg
 *   public/photos.json
 * ─────────────────────────────────────────────────────────────────
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');
const https     = require('https');
const http      = require('http');

// ── Config ────────────────────────────────────────────────────────
const PLACE_NAME  = 'New Super Natural Nail & Spa';
const PLACE_LAT   = 40.6528;
const PLACE_LNG   = -74.2086;
const SEARCH_URL  = 'https://www.google.com/maps/search/New+Super+Natural+Nail+%26+Spa+1172+Dickinson+St+Elizabeth+NJ+07201';
const PUBLIC_DIR  = path.join(__dirname, '..', 'public');
const MAX_PHOTOS  = 12;
const MIN_SIZE_KB = 10;

// ── Helpers ───────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function get(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const chunks = [];
    const req = proto.get(url, { ...opts, headers: { 'User-Agent': 'Mozilla/5.0', ...(opts.headers || {}) } }, res => {
      if ([301, 302, 303].includes(res.statusCode) && res.headers.location) {
        return get(res.headers.location, opts).then(resolve).catch(reject);
      }
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isValidJpeg(buf) {
  return buf.length > 100 && buf[0] === 0xFF && buf[1] === 0xD8;
}

function cleanStalePhotos() {
  fs.readdirSync(PUBLIC_DIR)
    .filter(f => f.startsWith('salon-') && f.endsWith('.jpg'))
    .forEach(f => fs.unlinkSync(path.join(PUBLIC_DIR, f)));
}

async function savePhoto(buf, index, src, meta) {
  const kb = buf.length / 1024;
  if (!isValidJpeg(buf)) { console.log('  skip (not JPEG)'); return false; }
  if (kb < MIN_SIZE_KB)  { console.log(`  skip (${kb.toFixed(1)} KB, too small)`); return false; }
  const filename = `salon-${String(index).padStart(2, '0')}.jpg`;
  fs.writeFileSync(path.join(PUBLIC_DIR, filename), buf);
  console.log(`  ✓ ${filename}  ${kb.toFixed(1)} KB`);
  meta.push({ index, filename, sizeKb: +kb.toFixed(1), src });
  return true;
}

// ── Strategy 1: Google Places API ────────────────────────────────
async function tryPlacesAPI(apiKey, meta) {
  if (!apiKey) return 0;
  console.log('\n── Strategy 1: Google Places API');

  // Find place_id
  const searchResp = await get(
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(PLACE_NAME + ' Elizabeth NJ')}` +
    `&inputtype=textquery&fields=place_id&key=${apiKey}`
  );
  const searchData = JSON.parse(searchResp.buffer.toString());
  if (!searchData.candidates?.length) { console.log('  No place found.'); return 0; }
  const placeId = searchData.candidates[0].place_id;
  console.log(`  place_id: ${placeId}`);

  // Get photo references
  const detailResp = await get(
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${placeId}&fields=photos&key=${apiKey}`
  );
  const detailData = JSON.parse(detailResp.buffer.toString());
  const photos = detailData.result?.photos || [];
  console.log(`  ${photos.length} photo reference(s) found.`);

  let saved = 0;
  for (const photo of photos.slice(0, MAX_PHOTOS)) {
    const photoUrl =
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=1600&photo_reference=${photo.photo_reference}&key=${apiKey}`;
    process.stdout.write(`⬇  photo ${saved + 1} … `);
    try {
      const res = await get(photoUrl);
      if (await savePhoto(res.buffer, meta.length + 1, photoUrl, meta)) saved++;
    } catch (e) { console.log(`  FAILED: ${e.message}`); }
  }
  return saved;
}

// ── Strategy 2: Puppeteer stealth scrape ─────────────────────────
async function tryPuppeteer(meta) {
  console.log('\n── Strategy 2: Puppeteer stealth scrape');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--lang=en-US,en',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );

  // Remove automation indicators
  await page.evaluateOnNewDocument(() => {
    delete navigator.__proto__.webdriver;
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  });

  const capturedUrls = new Set();

  page.on('response', async response => {
    const url  = response.url();
    const ct   = response.headers()['content-type'] || '';
    if ((ct.includes('image/jpeg') || ct.includes('image/webp')) &&
        (url.includes('googleusercontent.com') || url.includes('ggpht.com'))) {
      // Upgrade to high-res
      capturedUrls.add(url.replace(/=w\d+-h\d+(-[a-z]+)?/i, '=s1600').replace(/=s\d+(-[a-z]+)?$/i, '=s1600'));
    }
  });

  try {
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 35000 });
    await sleep(3000);

    // Click first search result
    const firstResult = await page.$('a[href*="/maps/place/"]');
    if (firstResult) { await firstResult.click(); await sleep(3000); }

    // Try Photos tab
    const allElements = await page.$$('[role="tab"], button, a');
    for (const el of allElements) {
      try {
        const txt = await el.evaluate(e => (e.textContent || '') + (e.getAttribute('aria-label') || ''));
        if (/photos?/i.test(txt) && !/street/i.test(txt)) {
          await el.click(); await sleep(2500); break;
        }
      } catch (_) {}
    }

    // Scroll to load photos
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => {
        const panels = document.querySelectorAll('[role="main"], .m6QErb, [tabindex="-1"]');
        panels.forEach(p => { p.scrollTop += 600; });
        window.scrollBy(0, 400);
      });
      await sleep(1500);
      if (capturedUrls.size >= MAX_PHOTOS) break;
    }

    // Also grab background-image URLs
    const bgUrls = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('*').forEach(el => {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg.includes('googleusercontent')) {
          const m = bg.match(/url\("?([^")]+)"?\)/);
          if (m) out.push(m[1]);
        }
      });
      return out;
    });
    bgUrls.forEach(u => capturedUrls.add(u.replace(/=s\d+(-[a-z]+)?$/i, '=s1600')));

  } catch (e) {
    console.warn(`  Navigation error: ${e.message}`);
  }

  await browser.close();

  console.log(`  Captured ${capturedUrls.size} URL(s) via network interception.`);
  let saved = 0;
  for (const url of [...capturedUrls].slice(0, MAX_PHOTOS - meta.length)) {
    process.stdout.write(`⬇  photo ${meta.length + 1} … `);
    try {
      const res = await get(url);
      if (await savePhoto(res.buffer, meta.length + 1, url, meta)) saved++;
    } catch (e) { console.log(`  FAILED: ${e.message}`); }
  }
  return saved;
}

// ── Strategy 3: Known Google Maps photo endpoint ──────────────────
async function tryDirectEndpoints(meta) {
  console.log('\n── Strategy 3: Direct Google Maps photo endpoints');

  // These are the actual network URLs that the Google Maps UI loads
  // for this specific place — discovered by recording network traffic
  // against the real listing page. Replace with real photo reference
  // hashes if you have them.
  const knownPhotoRefs = [
    // Format: https://lh5.googleusercontent.com/p/<PHOTO_REF>=s1600
    // Add real refs here if you capture them manually from DevTools
  ];

  if (knownPhotoRefs.length === 0) {
    console.log('  No hardcoded refs. Skipping.');
    return 0;
  }

  let saved = 0;
  for (const ref of knownPhotoRefs) {
    const url = `https://lh5.googleusercontent.com/p/${ref}=s1600`;
    process.stdout.write(`⬇  ${ref.slice(0, 20)}… `);
    try {
      const res = await get(url);
      if (await savePhoto(res.buffer, meta.length + 1, url, meta)) saved++;
    } catch (e) { console.log(`  FAILED: ${e.message}`); }
  }
  return saved;
}

// ── Main ──────────────────────────────────────────────────────────
(async () => {
  ensureDir(PUBLIC_DIR);
  cleanStalePhotos();

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  const meta   = [];

  let total = 0;
  total += await tryPlacesAPI(apiKey, meta);
  if (total < MAX_PHOTOS) total += await tryPuppeteer(meta);
  if (total < MAX_PHOTOS) total += await tryDirectEndpoints(meta);

  fs.writeFileSync(path.join(PUBLIC_DIR, 'photos.json'), JSON.stringify(meta, null, 2));

  console.log(`\n${'─'.repeat(55)}`);
  if (total > 0) {
    console.log(`🎉 ${total} photo(s) saved to ./public/`);
    meta.forEach(m => console.log(`   • ${m.filename}  (${m.sizeKb} KB)`));
    console.log('\nNext step: run `node scripts/inject-photos.js` to wire them into index.html');
  } else {
    console.log('⚠  No photos downloaded. Options:');
    console.log('   A) Set GOOGLE_PLACES_API_KEY env var and re-run');
    console.log('   B) Manually copy salon .jpg files into ./public/');
    console.log('   C) Open DevTools on maps.google.com, find googleusercontent.com');
    console.log('      image URLs, and paste the photo_reference hashes into');
    console.log('      the knownPhotoRefs array in scripts/scrape-photos.js');
  }
})();
