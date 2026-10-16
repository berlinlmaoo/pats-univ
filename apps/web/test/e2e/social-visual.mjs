/** HQ visual check: one browser, one page, no mobile bundler. */
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL ?? "http://localhost:3014";
const output = process.env.QA_OUTPUT ?? "/tmp/pats-phase4-qa";
const executablePath =
  process.env.CHROMIUM_PATH ??
  "/Users/berlin/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext();
const errors = [],
  findings = [];
try {
  const request = await context.request.post(`${base}/api/auth/otp/request`, {
    data: { email: "hq@patsuniv.test", audience: "hq" },
  });
  const otp = await request.json();
  if (!otp.demoCode) throw new Error("Demo OTP unavailable");
  const login = await context.request.post(`${base}/api/auth/otp/verify`, {
    data: { email: "hq@patsuniv.test", code: otp.demoCode, client: "web" },
  });
  if (!login.ok()) throw new Error("Login failed");
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/social/") && response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  const labels = {
    en: [
      "Channels",
      "Reservations",
      "Roaming",
      "Venue floor plan",
      "Screenshot records",
    ],
    id: [
      "Channel",
      "Reservasi",
      "Roaming",
      "Denah venue",
      "Catatan screenshot",
    ],
  };
  for (const locale of ["id", "en"])
    for (const theme of ["light", "dark"])
      for (const width of [360, 390, 1440]) {
        await context.addCookies([
          { name: "pats_locale", value: locale, url: base },
        ]);
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(`${base}/hub`);
        await page
          .getByRole("button", { name: labels[locale][0], exact: true })
          .waitFor();
        for (let tab = 0; tab < labels[locale].length; tab++) {
          await page
            .getByRole("button", { name: labels[locale][tab], exact: true })
            .first()
            .click();
          await page.waitForTimeout(300);
          const name = `${locale}-${theme}-${width}-${tab}`;
          const metrics = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth,
            leakedKeys: /(social|settings\.keys|errors)\.[a-zA-Z]+/.test(
              document.body.innerText,
            ),
          }));
          findings.push({ name, ...metrics });
          await page.screenshot({
            path: `${output}/${name}.png`,
            fullPage: true,
          });
        }
      }
  await page.goto(`${base}/settings`);
  await page.waitForTimeout(400);
  findings.push({
    name: "settings",
    leakedKeys: await page.evaluate(() =>
      /settings\.(keys|unit|group)/.test(document.body.innerText),
    ),
  });
  await page.screenshot({ path: `${output}/settings.png`, fullPage: true });
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ errors, findings }, null, 2),
  );
  console.log(
    JSON.stringify({
      screenshots: findings.length,
      errors,
      failures: findings.filter((f) => f.overflow || f.leakedKeys),
    }),
  );
  if (errors.length || findings.some((f) => f.overflow || f.leakedKeys))
    process.exitCode = 1;
} finally {
  await browser.close();
}
