import type { TgConfig } from "./config";

export function apiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

export function methodForMime(mime: string): "sendVideo" | "sendDocument" {
  return mime.includes("mp4") ? "sendVideo" : "sendDocument";
}

// 클립 한 개 전송. 성공 시 true, 실패/예외 시 false(throw 안 함).
export async function sendClip(
  cfg: TgConfig,
  blob: Blob,
  mime: string,
  caption: string,
  baseName = "clip",
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const method = methodForMime(mime);
  const field = method === "sendVideo" ? "video" : "document";
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const form = new FormData();
  form.append("chat_id", cfg.chatId);
  if (caption) form.append("caption", caption);
  form.append(field, blob, `${baseName}.${ext}`);
  try {
    const res = await fetchImpl(apiUrl(cfg.token, method), { method: "POST", body: form });
    return !!res.ok;
  } catch {
    return false;
  }
}
