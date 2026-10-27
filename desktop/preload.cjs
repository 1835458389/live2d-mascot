const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petDesktop", {
  setInteractive: (v) => ipcRenderer.send("pet:interactive", !!v),
  quit: () => ipcRenderer.send("pet:quit"),
  setTrayIcon: (dataUrl) => ipcRenderer.send("pet:tray-icon", dataUrl),
  onOpenSettings: (fn) => ipcRenderer.on("pet:open-settings", () => fn()),
  onWakeUp: (fn) => ipcRenderer.on("pet:wake-up", () => fn()),
  // Other programs' windows: [[id, left, top, right, bottom], ...], front-most first.
  onWindows: (fn) => ipcRenderer.on("pet:windows", (_event, list) => fn(list)),
  // The program in front: { proc, title } (only sorted into a kind of activity by the page).
  onForeground: (fn) => ipcRenderer.on("pet:foreground", (_event, info) => fn(info)),
  // A line another program asked her to say: { text, mood } (the AI company reports a finished job).
  onSay: (fn) => ipcRenderer.on("pet:say", (_event, line) => fn(line)),
  // AI chat through MiniMax (the key stays in the main process).
  chat: (payload) => ipcRenderer.invoke("pet:chat", payload),
  speak: (payload) => ipcRenderer.invoke("pet:speak", payload),
});
