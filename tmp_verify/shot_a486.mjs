/* A4-86 描画確認。★推測でなく実描画で見る。
   ・登校を押して、連携が実際に呼ばれるかを window.__gasCalls で実測する
   ・幅 320/375/768/1024 で横スクロールが出ないことを見る */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5179/timetable-generator/tmp_verify/verify.html';
const OUT = 'tmp_verify/shots_a486_20260911';
const WIDTHS = [320, 375, 768, 1024];

const CASES = [
  { id: '01_qr-on_confirm-hit_dx-ok',        q: 'start=fresh&qr=on&confirm=hit&dx=ok' },
  { id: '02_qr-on_confirm-MISS_dx-ok',       q: 'start=fresh&qr=on&confirm=miss&dx=ok' },
  { id: '03_qr-on_confirm-hit_notEnrolled',  q: 'start=fresh&qr=on&confirm=hit&dx=notEnrolled' },
  { id: '04_qr-on_confirm-hit_noPassword',   q: 'start=fresh&qr=on&confirm=hit&dx=noPassword' },
  { id: '05_qr-OFF_confirm-hit_noDxUrl',     q: 'start=fresh&qr=off&confirm=hit&dx=noDxUrl' },
  { id: '06_qr-on_confirm-MISS_dxLoginFail', q: 'start=fresh&qr=on&confirm=miss&dx=dxLoginFailed' },
  { id: '07_qr-on_confirm-hit_http500',      q: 'start=fresh&qr=on&confirm=hit&dx=http500' },
];

const browser = await chromium.launch();
const report = [];

for (const c of CASES) {
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto(`${BASE}?${c.q}`, { waitUntil: 'networkidle' });
    const btn = page.getByRole('button', { name: '登校する' });
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.click();
    // 連携の行が出るまで待つ（出ないなら出ないことを記録する）
    await page.waitForTimeout(1500);

    const calls = await page.evaluate(() => window.__gasCalls || []);
    const dxCalled = calls.filter(a => a === 'dxCheckIn').length;
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const text = (await page.locator('.sheet').innerText()).replace(/\s+/g, ' ').trim();

    await page.screenshot({ path: `${OUT}/${c.id}_${w}.png`, fullPage: true });
    if (w === 375) report.push({ case: c.id, dxCalled, overflow, text: text.slice(0, 400) });
    else if (overflow) report.push({ case: c.id, width: w, overflow: true });
    await page.close();
  }
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
