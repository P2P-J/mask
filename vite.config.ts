/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // WSL2에서 /mnt/d(Windows 드라이브)의 파일은 inotify 감시가 안 먹혀 HMR이 안 됨 → 폴링으로 강제
  server: {
    watch: { usePolling: true, interval: 200 },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
