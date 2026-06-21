const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");

const isDev = process.env.ELECTRON_DEV === "1";

// 창/작업표시줄 아이콘. 개발은 public/, 배포는 dist/(electron-builder files에 포함)에서 로드.
// (Windows 패키지 .exe 아이콘 자체는 electron-builder의 win.icon=build/icon.ico가 담당)
const windowIcon = path.join(__dirname, "..", isDev ? "public" : "dist", "icon.png");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#1e1f22",
    title: "Mask",
    icon: windowIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  // 로컬 데스크톱 앱이므로 카메라/마이크 권한을 자동 허용.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
