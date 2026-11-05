import { writeFile } from 'node:fs/promises';
import { BrowserUnavailable, withHarnessBrowser } from './lib/browser-harness.mjs';
let report;
try {
  report = await withHarnessBrowser(async browser => { await browser.navigate('/tests/browser/gpu.html'); await browser.waitFor('!!window.gpuHarness'); return browser.evaluate('window.gpuHarness', 55000); });
} catch (error) { report = { status: error instanceof BrowserUnavailable ? 'unavailable' : 'failed', reason: String(error), scope: 'No GPU validation is claimed when browser execution is unavailable' }; }
console.log(JSON.stringify(report, null, 2)); if (process.env.GPU_REPORT_PATH) await writeFile(process.env.GPU_REPORT_PATH, JSON.stringify(report, null, 2));
if (report.status === 'failed' || process.env.GPU_REQUIRED === '1' && report.status !== 'passed') process.exitCode = 1;
