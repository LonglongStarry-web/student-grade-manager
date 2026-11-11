"use strict";

const { ipcRenderer } = require("electron");

const STORAGE_KEY = "offline-grade-manager-v1";
const fileData = ipcRenderer.sendSync("grade-data:load");

if (fileData) {
  localStorage.setItem(STORAGE_KEY, fileData);
} else {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) ipcRenderer.sendSync("grade-data:save", existing);
}

let lastSaved = localStorage.getItem(STORAGE_KEY);

function syncDataFile() {
  const current = localStorage.getItem(STORAGE_KEY);
  if (!current || current === lastSaved) return;
  const result = ipcRenderer.sendSync("grade-data:save", current);
  if (result?.ok) lastSaved = current;
}

window.setInterval(syncDataFile, 200);
window.addEventListener("beforeunload", syncDataFile);
