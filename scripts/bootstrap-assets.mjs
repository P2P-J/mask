import { existsSync, mkdirSync, cpSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 1) MediaPipe wasm 파일을 public/wasm 으로 복사 (오프라인 서빙)
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDest = join(root, "public/wasm");
mkdirSync(wasmDest, { recursive: true });
cpSync(wasmSrc, wasmDest, { recursive: true });
console.log("[bootstrap] wasm 복사 완료 →", wasmDest);

// 2) 모델 다운로드 (없을 때만)
const modelDir = join(root, "public/models");
mkdirSync(modelDir, { recursive: true });

async function fetchModel(name, url) {
  const path = join(modelDir, name);
  if (existsSync(path)) {
    console.log("[bootstrap] 모델 이미 존재, 건너뜀 →", name);
    return;
  }
  console.log("[bootstrap] 모델 다운로드 중…", name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`모델 다운로드 실패(${name}): ` + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  console.log("[bootstrap] 모델 저장 완료 →", name, buf.length, "bytes");
}

await fetchModel(
  "face_landmarker.task",
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
);
await fetchModel(
  "selfie_segmenter.tflite",
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite"
);
