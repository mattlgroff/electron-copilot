const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Device management
  enumerateDevices: () => ipcRenderer.invoke("enumerate-devices"),
  selectDevice: (deviceId, deviceType) =>
    ipcRenderer.invoke("select-device", deviceId, deviceType),
  testDevice: (deviceId, deviceType) =>
    ipcRenderer.invoke("test-device", deviceId, deviceType),

  // Region selection
  startRegionSelection: () => ipcRenderer.invoke("start-region-selection"),
  setRegion: (region) => ipcRenderer.invoke("set-region", region),
  getStoredRegion: () => ipcRenderer.invoke("get-setting", "selectedRegion"),

  // Media capture
  startRecording: (options) => ipcRenderer.invoke("start-recording", options),
  stopRecording: () => ipcRenderer.invoke("stop-recording"),
  pauseRecording: () => ipcRenderer.invoke("pause-recording"),
  resumeRecording: () => ipcRenderer.invoke("resume-recording"),

  // Settings persistence
  getSetting: (key) => ipcRenderer.invoke("get-setting", key),
  setSetting: (key, value) => ipcRenderer.invoke("set-setting", key, value),

  // File operations
  saveRecording: (data) => ipcRenderer.invoke("save-recording", data),
  showSaveDialog: (options) => ipcRenderer.invoke("show-save-dialog", options),

  // WebRTC and streaming
  startStreaming: (config) => ipcRenderer.invoke("start-streaming", config),
  stopStreaming: () => ipcRenderer.invoke("stop-streaming"),
  pauseStreaming: () => ipcRenderer.invoke("pause-streaming"),
  resumeStreaming: () => ipcRenderer.invoke("resume-streaming"),
  sendChatMessage: (message) =>
    ipcRenderer.invoke("send-chat-message", message),

  // Event listeners
  onStreamingResponse: (callback) =>
    ipcRenderer.on("streaming-response", callback),
  onStreamingStatus: (callback) => ipcRenderer.on("streaming-status", callback),
  onRecordingStatus: (callback) => ipcRenderer.on("recording-status", callback),
  onError: (callback) => ipcRenderer.on("error", callback),
  onRegionSelected: (callback) => ipcRenderer.on("region-selected", callback),
  onRegionSelectionCancelled: (callback) =>
    ipcRenderer.on("region-selection-cancelled", callback),

  // Remove event listeners
  removeListener: (channel, callback) =>
    ipcRenderer.removeListener(channel, callback),

  // Menu actions
  showDevicePreferences: () => ipcRenderer.invoke("show-device-preferences"),

  // Window management
  closeWindow: () => ipcRenderer.invoke("close-window"),
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  maximizeWindow: () => ipcRenderer.invoke("maximize-window"),

  // Save folder management
  getSaveFolder: () => ipcRenderer.invoke("get-save-folder"),
  chooseSaveFolder: () => ipcRenderer.invoke("choose-save-folder"),
  resetSaveFolder: () => ipcRenderer.invoke("reset-save-folder"),

  // Display information
  onDisplayInfo: (callback) => ipcRenderer.on("display-info", callback),
});
