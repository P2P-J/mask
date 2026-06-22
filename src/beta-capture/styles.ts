let injected = false;

export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const css = `
.bc-launch{position:fixed;left:12px;bottom:12px;z-index:9998;font:13px/1.2 sans-serif;
  background:#2b2d31;color:#e3e5e8;border:1px solid #3a3d44;border-radius:8px;padding:8px 12px;cursor:pointer}
.bc-launch[disabled]{opacity:.5;cursor:not-allowed}
.bc-launch.on{background:#3182F6;border-color:#3182F6;color:#fff}
.bc-badge{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;
  display:none;align-items:center;gap:10px;font:13px/1.2 sans-serif;
  background:#2b2d31;color:#fff;border:1px solid #d23;border-radius:999px;padding:7px 14px}
.bc-badge.show{display:flex}
.bc-dot{width:9px;height:9px;border-radius:50%;background:#e23;animation:bc-blink 1s infinite}
@keyframes bc-blink{50%{opacity:.25}}
.bc-stop{background:#e23;color:#fff;border:0;border-radius:6px;padding:3px 9px;cursor:pointer;font:12px sans-serif}
.bc-modal-bg{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);
  display:flex;align-items:center;justify-content:center}
.bc-modal{max-width:420px;background:#1e1f22;color:#e3e5e8;border:1px solid #3a3d44;border-radius:12px;
  padding:20px;font:14px/1.5 sans-serif}
.bc-modal h3{margin:0 0 10px;font-size:16px}
.bc-modal ul{margin:10px 0;padding-left:18px}
.bc-row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.bc-btn{border:0;border-radius:8px;padding:9px 14px;cursor:pointer;font:14px sans-serif}
.bc-ok{background:#3182F6;color:#fff}
.bc-no{background:#3a3d44;color:#e3e5e8}
.bc-name-label{display:block;margin-top:14px;font-size:13px;color:#b5bac1}
.bc-name{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:8px 10px;
  border-radius:8px;border:1px solid #3a3d44;background:#111317;color:#e3e5e8;font:14px sans-serif}`;
  const el = document.createElement("style");
  el.id = "bc-styles";
  el.textContent = css;
  document.head.appendChild(el);
}
