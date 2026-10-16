import { describe, expect, it } from "vitest";
import {
  channelSchema,
  orderHubItems,
  type HubItem,
  layoutSchema,
  mentionsAdmin,
  messageSchema,
  roamingExpiry,
  validRoaming,
  settingValueSchema,
  createTranslator,
} from "../src";
describe("social policies used by the app and server", () => {
  it("requires exactly one message destination and matching media", () => {
    expect(
      messageSchema.safeParse({
        channelId: "a",
        conversationId: "b",
        body: "hello",
      }).success,
    ).toBe(false);
    expect(messageSchema.safeParse({ body: "hello" }).success).toBe(false);
    expect(messageSchema.safeParse({ channelId: "a", body: " " }).success).toBe(
      false,
    );
    expect(
      messageSchema.safeParse({ channelId: "a", mediaType: "VOICE" }).success,
    ).toBe(false);
    expect(
      messageSchema.safeParse({
        channelId: "a",
        mediaType: "VOICE",
        mediaKey: "hub/a/test.m4a",
      }).success,
    ).toBe(true);
  });
  it("recognizes an admin mention without matching email addresses or larger words", () => {
    for (const text of ["@ADMIN help", "hello @admin!", "hello\n@ADMIN"])
      expect(mentionsAdmin(text)).toBe(true);
    for (const text of ["a@admin.test", "@ADMINISTRATOR", "admin"])
      expect(mentionsAdmin(text)).toBe(false);
  });
  it("rejects duplicate, overlapping and out-of-bounds floor slots", () => {
    const slot = { code: "S1", kind: "SOFA", x: 0, y: 0, w: 2, h: 2, pax: 4 };
    expect(
      layoutSchema.safeParse({ slots: [slot, { ...slot, code: "S2", x: 2 }] })
        .success,
    ).toBe(true);
    for (const s of [
      { ...slot, x: 3 },
      { ...slot, code: "S2", x: 1 },
      { ...slot, code: "S2", x: 11 },
    ])
      expect(layoutSchema.safeParse({ slots: [slot, s] }).success).toBe(false);
  });
  it("ends attendance at event end and hub access at the configured offset", () => {
    const end = new Date("2026-10-17T18:00:00Z");
    expect(roamingExpiry(end, "ATTENDANCE", 48)).toEqual(end);
    const expires = roamingExpiry(end, "SOCIAL_HUB", 48);
    expect(expires.toISOString()).toBe("2026-10-19T18:00:00.000Z");
    expect(
      validRoaming(
        { status: "APPROVED", accessExpiresAt: expires },
        new Date(expires.getTime() - 1),
      ),
    ).toBe(true);
    expect(
      validRoaming({ status: "APPROVED", accessExpiresAt: expires }, expires),
    ).toBe(false);
    expect(
      validRoaming({ status: "PENDING", accessExpiresAt: expires }, end),
    ).toBe(false);
    expect(
      validRoaming({ status: "APPROVED", accessExpiresAt: null }, end),
    ).toBe(false);
  });
  it("validates remote defaults and per-channel posting overrides", () => {
    expect(settingValueSchema("hubMediaMaxMb").safeParse(26).success).toBe(
      false,
    );
    expect(settingValueSchema("hubMediaMaxSeconds").safeParse(61).success).toBe(
      false,
    );
    expect(settingValueSchema("hubHistoryDays").safeParse(31).success).toBe(
      false,
    );
    expect(
      channelSchema.parse({ cityId: "a", name: "Timeline", kind: "TIMELINE" })
        .memberPosting,
    ).toBe(null);
    for (const locale of ["id", "en"] as const)
      for (const key of [
        "social.title",
        "social.mediaHint",
        "errors.hubMuted",
        "push.hubMention.body",
        "settings.keys.hubMediaMaxMb.label",
      ])
        expect(createTranslator(locale).loose(key)).not.toBe(key);
  });
});

it("orders the mobile chat chronologically and pins the timeline without mutating cached data", () => {
  const base = {
    body: "text",
    author: { id: "u", name: "Member" },
    mediaType: "TEXT" as const,
    mediaKey: null,
    mediaUrl: null,
  };
  const rows: HubItem[] = [
    { ...base, id: "b", createdAt: "2026-10-16T02:00:00Z", pinned: false },
    { ...base, id: "a", createdAt: "2026-10-16T01:00:00Z", pinned: false },
  ];
  expect(orderHubItems(rows, false).map((r) => r.id)).toEqual(["a", "b"]);
  expect(orderHubItems(rows, true).map((r) => r.id)).toEqual(["b", "a"]);
  expect(
    orderHubItems([{ ...rows[1]!, pinned: true }, rows[0]!], true).map(
      (r) => r.id,
    ),
  ).toEqual(["a", "b"]);
  expect(rows[0]!.id).toBe("b");
});
