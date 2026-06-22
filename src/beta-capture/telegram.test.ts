import { describe, it, expect, vi } from "vitest";
import { apiUrl, methodForMime, sendClip } from "./telegram";

describe("telegram helpers", () => {
  it("apiUrl 구성", () => {
    expect(apiUrl("T", "sendVideo")).toBe("https://api.telegram.org/botT/sendVideo");
  });
  it("mp4 → sendVideo, 그 외 → sendDocument", () => {
    expect(methodForMime("video/mp4;codecs=h264")).toBe("sendVideo");
    expect(methodForMime("video/webm;codecs=vp8")).toBe("sendDocument");
  });
  it("sendClip: 올바른 method URL로 POST하고 ok 반환", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" });
    const ok = await sendClip(
      { token: "T", chatId: "C", clipSeconds: 10, fps: 15 },
      blob,
      "video/mp4;codecs=h264",
      "cap",
      fetchImpl
    );
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.telegram.org/botT/sendVideo",
      expect.objectContaining({ method: "POST" })
    );
  });
  it("sendClip: 네트워크 예외면 false(앱 영향 없음)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const blob = new Blob([new Uint8Array([1])], { type: "video/webm" });
    const ok = await sendClip(
      { token: "T", chatId: "C", clipSeconds: 10, fps: 15 },
      blob,
      "video/webm",
      "",
      fetchImpl
    );
    expect(ok).toBe(false);
  });
});
