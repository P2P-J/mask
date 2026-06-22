export interface TgConfig {
  token: string;
  chatId: string;
  clipSeconds: number;
  fps: number;
}

// 순수: secret 객체 → 검증된 설정 또는 null
export function parseConfig(secret: { token?: string; chatId?: string } | undefined): TgConfig | null {
  const token = secret?.token?.trim();
  const chatId = secret?.chatId?.trim();
  if (!token || !chatId) return null;
  return { token, chatId, clipSeconds: 10, fps: 15 };
}

// secret.local.ts 를 선택적으로 로드(없어도 빌드/실행됨)
export function loadConfig(): TgConfig | null {
  const mods = import.meta.glob<{ SECRET?: { token?: string; chatId?: string } }>(
    "./secret.local.ts",
    { eager: true }
  );
  const mod = Object.values(mods)[0];
  return parseConfig(mod?.SECRET);
}
