import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { mediaDuration, verifyMediaTicket } from "@/lib/social/media";
function box(type: string, body: Buffer) {
  const b = Buffer.alloc(body.length + 8);
  b.writeUInt32BE(b.length);
  b.write(type, 4);
  body.copy(b, 8);
  return b;
}
function movie(seconds: number, version = 0) {
  const body = Buffer.alloc(version === 1 ? 36 : 24);
  body[0] = version;
  body.writeUInt32BE(1000, version === 1 ? 20 : 12);
  if (version === 1) body.writeBigUInt64BE(BigInt(seconds * 1000), 24);
  else body.writeUInt32BE(seconds * 1000, 16);
  return box("moov", box("mvhd", body));
}
describe("private hub media", () => {
  it("reads native MP4 and M4A duration in v0 and v1 movie headers", () => {
    expect(mediaDuration(movie(60))).toBe(60);
    expect(mediaDuration(movie(61, 1))).toBe(61);
  });
  it("rejects truncated, invalid and zero-timescale files", () => {
    expect(mediaDuration(Buffer.from("not a movie"))).toBe(null);
    expect(mediaDuration(movie(10).subarray(0, 20))).toBe(null);
    const bad = movie(10);
    bad.writeUInt32BE(0, 28);
    expect(mediaDuration(bad)).toBe(null);
  });
  it("rejects unsigned and malformed upload grants", () => {
    expect(() =>
      verifyMediaTicket(
        new Request("http://localhost/api/social/media-file?data=abc&sig=no"),
        "write",
      ),
    ).toThrow();
  });
});
