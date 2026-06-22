const KEY = "mask.betaCapture.consent.v1";

type Reader = { getItem(k: string): string | null };
type Writer = Reader & { setItem(k: string, v: string): void; removeItem(k: string): void };

export function hasConsent(storage: Reader = localStorage): boolean {
  try {
    return storage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setConsent(v: boolean, storage: Writer = localStorage): void {
  try {
    if (v) storage.setItem(KEY, "1");
    else storage.removeItem(KEY);
  } catch {
    /* 프라이빗 모드 등 무시 */
  }
}
