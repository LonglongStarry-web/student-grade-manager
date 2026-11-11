"use strict";

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");

app.setName("学生成绩管理系统");
app.setPath("userData", path.join(app.getPath("appData"), "StudentGradeManager"));

const DATA_FILE = path.join(app.getPath("userData"), "data.json");
const BACKUP_FILE = `${DATA_FILE}.bak`;
const TEMP_FILE = `${DATA_FILE}.tmp`;

function isValidDataText(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" &&
      ["classes", "subjects", "students", "exams", "scores"].every(key => Array.isArray(value[key])) &&
      value.settings && Number.isFinite(Number(value.settings.passScore)) && Number.isFinite(Number(value.settings.excellentScore));
  } catch {
    return false;
  }
}

function readData() {
  for (const file of [DATA_FILE, BACKUP_FILE]) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      if (isValidDataText(text)) return text;
    } catch (error) {
      console.error(`无法读取 ${file}`, error);
    }
  }
  return null;
}

function writeData(text) {
  if (!isValidDataText(text)) throw new Error("拒绝保存：数据格式无效");
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(TEMP_FILE, text, "utf8");
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE);
  fs.renameSync(TEMP_FILE, DATA_FILE);
}

ipcMain.on("grade-data:load", event => {
  event.returnValue = readData();
});

ipcMain.on("grade-data:save", (event, text) => {
  try {
    writeData(text);
    event.returnValue = { ok: true };
  } catch (error) {
    console.error("保存成绩数据失败", error);
    event.returnValue = { ok: false, error: error.message };
  }
});

ipcMain.on("grade-data:path", event => {
  event.returnValue = DATA_FILE;
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#f3f5f7",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadFile("index.html");
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", event => event.preventDefault());
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
