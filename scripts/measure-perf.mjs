import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST_ASSETS = path.resolve(process.cwd(), 'client/dist/assets');

if (!fs.existsSync(DIST_ASSETS)) {
  console.error(`Dist assets directory not found at: ${DIST_ASSETS}. Run "npm run build:all" first.`);
  process.exit(1);
}

const files = fs.readdirSync(DIST_ASSETS);

const results = [];
let totalInitialGzip = 0;
let totalInitialRaw = 0;

const INITIAL_CHUNK_PATTERNS = [
  /^index-[a-zA-Z0-9_-]+\.js$/,
  /^vendor-framework-[a-zA-Z0-9_-]+\.js$/,
  /^vendor-icons-[a-zA-Z0-9_-]+\.js$/,
  /^LoginPage-[a-zA-Z0-9_-]+\.js$/,
];

for (const file of files) {
  const filePath = path.join(DIST_ASSETS, file);
  const content = fs.readFileSync(filePath);
  const rawSize = content.length;
  const gzipSize = zlib.gzipSync(content).length;

  const isInitial = INITIAL_CHUNK_PATTERNS.some((pat) => pat.test(file));
  if (isInitial) {
    totalInitialGzip += gzipSize;
    totalInitialRaw += rawSize;
  }

  results.push({
    file,
    rawKb: (rawSize / 1024).toFixed(2),
    gzipKb: (gzipSize / 1024).toFixed(2),
    isInitial,
  });
}

console.log('='.repeat(70));
console.log('  WHATSUS PHASE A PERFORMANCE & BUNDLE BUDGET AUDIT');
console.log('='.repeat(70));

console.log('\n[Initial Entry Bundle (Cold-Start Critical Path)]');
const initialFiles = results.filter((r) => r.isInitial);
for (const item of initialFiles) {
  console.log(`  * ${item.file.padEnd(42)} ${item.rawKb.padStart(8)} KB raw │ ${item.gzipKb.padStart(7)} KB gzip`);
}

const totalInitialGzipKb = (totalInitialGzip / 1024).toFixed(2);
const totalInitialRawKb = (totalInitialRaw / 1024).toFixed(2);
const BUDGET_LIMIT_GZIP_KB = 200.0;

console.log('-'.repeat(70));
console.log(`  TOTAL INITIAL JS (GZIPPED):   ${totalInitialGzipKb.padStart(7)} KB / ${BUDGET_LIMIT_GZIP_KB} KB budget`);
console.log(`  TOTAL INITIAL JS (RAW):       ${totalInitialRawKb.padStart(7)} KB`);
console.log('-'.repeat(70));

console.log('\n[Lazy-Loaded Chunks (On-Demand Isolation Check)]');
const lazyFiles = results.filter((r) => !r.isInitial && r.file.endsWith('.js'));
for (const item of lazyFiles) {
  console.log(`  - ${item.file.padEnd(42)} ${item.rawKb.padStart(8)} KB raw │ ${item.gzipKb.padStart(7)} KB gzip`);
}

// Verification checks
let pass = true;

if (parseFloat(totalInitialGzipKb) > BUDGET_LIMIT_GZIP_KB) {
  console.error(`\n❌ BUDGET VIOLATION: Initial JS (${totalInitialGzipKb} KB gzip) exceeds budget of ${BUDGET_LIMIT_GZIP_KB} KB!`);
  pass = false;
} else {
  console.log(`\n✅ Initial JS budget PASSED: ${totalInitialGzipKb} KB < ${BUDGET_LIMIT_GZIP_KB} KB target (${((parseFloat(totalInitialGzipKb) / BUDGET_LIMIT_GZIP_KB) * 100).toFixed(1)}% of budget used)`);
}

const cryptoIsolated = lazyFiles.some((f) => f.file.startsWith('vendor-crypto'));
if (cryptoIsolated) {
  console.log('✅ Heavy crypto WASM is verified isolated in on-demand lazy chunk');
} else {
  console.error('❌ Crypto chunk not found in lazy chunks!');
  pass = false;
}

const virtualIsolated = lazyFiles.some((f) => f.file.startsWith('vendor-virtual'));
if (virtualIsolated) {
  console.log('✅ Message virtualizer is verified isolated in on-demand lazy chunk');
}

console.log('='.repeat(70));

if (!pass) {
  process.exit(1);
}
