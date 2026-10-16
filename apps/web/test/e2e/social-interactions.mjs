import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
await mkdir("/tmp/pats-phase4-qa", { recursive: true });
import { randomBytes, createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/index.js";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
if (!new URL(process.env.DATABASE_URL).pathname.includes("_p4"))
  throw new Error("Use a dedicated phase-4 database");
const base = process.env.BASE_URL ?? "http://localhost:3014";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ??
    "/Users/berlin/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
});
let event, grant, post, session;
const original = await db.setting.findUnique({
  where: { id: "GLOBAL::roamingHubExpiryHours" },
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const hq = await db.user.findFirstOrThrow({
    where: { role: "SUPER_ADMIN", email: "hq@patsuniv.test" },
  });
  const secret = randomBytes(32).toString("hex");
  session = await db.session.create({
    data: {
      userId: hq.id,
      client: "WEB",
      tokenHash: createHash("sha256").update(secret).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await context.addCookies([
    { name: "pats_session", value: secret, url: base },
  ]);
  await context.addCookies([{ name: "pats_locale", value: "en", url: base }]);
  const page = await context.newPage();
  await page.goto(`${base}/hub`);
  await page
    .getByRole("button", { name: "Open channel", exact: true })
    .first()
    .click();
  const text =
    `Community QA ${Date.now()} — ${"A long community message with clear wrapping. ".repeat(8)}`.trim();
  await page.getByLabel("Message", { exact: true }).fill(text);
  const posted = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/social/posts") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  assert((await posted).ok());
  await page.getByText(text, { exact: true }).waitFor();
  post = await db.post.findFirstOrThrow({ where: { body: text } });
  await page.getByRole("button", { name: "Pin", exact: true }).first().click();
  await page
    .getByText(/Pinned/)
    .first()
    .waitFor();
  assert.equal(
    (await db.post.findUniqueOrThrow({ where: { id: post.id } })).pinned,
    true,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "/tmp/pats-phase4-qa/populated-timeline.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Delete content", exact: true })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({
    path: "/tmp/pats-phase4-qa/delete-dialog.png",
    fullPage: true,
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete content", exact: true })
    .click();
  await page.getByText(text, { exact: true }).waitFor({ state: "hidden" });
  console.log("PASS dashboard post, pin and confirmed delete");
  const cities = await db.city.findMany({ take: 2 });
  const member = await db.member.findFirstOrThrow({
    where: { cityId: cities[1].id },
  });
  const end = new Date(Date.now() - 2 * 3600000);
  event = await db.event.create({
    data: {
      title: "Visual roaming expiry check",
      cityId: cities[0].id,
      status: "CLOSED",
      startsAt: new Date(end.getTime() - 3600000),
      endsAt: end,
      checkInOpensAt: new Date(end.getTime() - 3600000),
      checkInClosesAt: end,
    },
  });
  grant = await db.roamingRequest.create({
    data: {
      memberId: member.id,
      eventId: event.id,
      targetCityId: event.cityId,
      type: "SOCIAL_HUB",
      status: "APPROVED",
      accessExpiresAt: new Date(end.getTime() + 48 * 3600000),
    },
  });
  await page.goto(`${base}/settings`);
  const field = page.locator("#setting-roamingHubExpiryHours");
  await field.fill("1");
  await field
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.waitForTimeout(500);
  assert(
    (await db.roamingRequest.findUniqueOrThrow({ where: { id: grant.id } }))
      .accessExpiresAt < new Date(),
  );
  console.log(
    "PASS dashboard roaming setting updates existing approved grants",
  );
  await page.screenshot({
    path: "/tmp/pats-phase4-qa/roaming-setting.png",
    fullPage: true,
  });
} finally {
  await db.post.deleteMany({
    where: { body: { startsWith: "Community QA " } },
  });
  if (grant) await db.roamingRequest.deleteMany({ where: { id: grant.id } });
  if (event) await db.event.deleteMany({ where: { id: event.id } });
  if (original)
    await db.setting.update({
      where: { id: original.id },
      data: { value: original.value },
    });
  else
    await db.setting.deleteMany({
      where: { id: "GLOBAL::roamingHubExpiryHours" },
    });
  if (session) await db.session.delete({ where: { id: session.id } });
  await browser.close();
  await db.$disconnect();
}
