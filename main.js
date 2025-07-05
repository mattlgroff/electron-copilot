import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  desktopCapturer,
  screen,
} from "electron";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Store from "electron-store";
import fs from "fs";
import ffmpeg from "ffmpeg-static";
import { spawn } from "child_process";
import os from "os";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize electron-store
const store = new Store();

// Keep a global reference of the window object
let mainWindow;
let regionWindow;

// Get cross-platform Videos folder
function getVideosFolder() {
  const homeDir = os.homedir();
  const platform = os.platform();

  let videosPath;
  if (platform === "win32") {
    videosPath = path.join(homeDir, "Videos");
  } else if (platform === "darwin") {
    videosPath = path.join(homeDir, "Movies");
  } else {
    // Linux and other Unix-like systems
    videosPath = path.join(homeDir, "Videos");
  }

  // Check if Videos folder exists, fallback to home directory
  if (fs.existsSync(videosPath)) {
    return videosPath;
  }

  return homeDir;
}

// Initialize default save folder if not set
function initializeDefaultSaveFolder() {
  const currentFolder = store.get("saveFolder");
  if (!currentFolder) {
    const videosFolder = getVideosFolder();
    store.set("saveFolder", videosFolder);
    console.log("Default save folder set to:", videosFolder);
  }
}

function createWindow() {
  // Initialize default save folder
  initializeDefaultSaveFolder();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.js"),
    },
    titleBarStyle: "hiddenInset",
    show: false,
  });

  // Load the app
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, "dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "New Recording",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            mainWindow.webContents.send("menu-new-recording");
          },
        },
        {
          label: "Open Recording",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ["openFile"],
              filters: [{ name: "MP4 Videos", extensions: ["mp4"] }],
            });
            if (!result.canceled) {
              mainWindow.webContents.send(
                "menu-open-recording",
                result.filePaths[0]
              );
            }
          },
        },
        { type: "separator" },
        {
          label: "Exit",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Preferences",
      submenu: [
        {
          label: "Devices",
          click: () => {
            mainWindow.webContents.send("show-device-preferences");
          },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers
ipcMain.handle("enumerate-devices", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
    });

    // Note: We can't directly enumerate audio devices from main process
    // This will be handled in the renderer process using navigator.mediaDevices
    return {
      screens: sources.filter((source) => source.id.startsWith("screen")),
      windows: sources.filter((source) => source.id.startsWith("window")),
    };
  } catch (error) {
    console.error("Error enumerating devices:", error);
    throw error;
  }
});

ipcMain.handle("select-device", async (event, deviceId, deviceType) => {
  try {
    store.set(`selectedDevice.${deviceType}`, deviceId);
    return true;
  } catch (error) {
    console.error("Error selecting device:", error);
    throw error;
  }
});

ipcMain.handle("get-setting", async (event, key) => {
  return store.get(key);
});

ipcMain.handle("set-setting", async (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle("get-stored-region", async () => {
  return store.get("selectedRegion", null);
});

ipcMain.handle("set-region", async (event, region) => {
  try {
    // Mark that region selection was successful
    regionSelectionInProgress = false;

    // Store the region
    store.set("selectedRegion", region);

    // Send region-selected event to main window
    if (mainWindow) {
      mainWindow.webContents.send("region-selected", region);
    }

    // Close the region selection window
    if (regionWindow) {
      regionWindow.close();
    }

    return true;
  } catch (error) {
    console.error("Error setting region:", error);
    throw error;
  }
});

ipcMain.handle("show-save-dialog", async (event, options) => {
  const currentSaveFolder = store.get("saveFolder") || getVideosFolder();

  // Add the default directory to options
  const updatedOptions = {
    ...options,
    defaultPath: path.join(
      currentSaveFolder,
      options.defaultPath || `recording-${Date.now()}.mp4`
    ),
  };

  const result = await dialog.showSaveDialog(mainWindow, updatedOptions);
  return result;
});

ipcMain.handle("get-save-folder", async () => {
  return store.get("saveFolder") || getVideosFolder();
});

ipcMain.handle("choose-save-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Choose Default Save Folder for Recordings",
    defaultPath: store.get("saveFolder") || getVideosFolder(),
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedFolder = result.filePaths[0];
    store.set("saveFolder", selectedFolder);
    return selectedFolder;
  }

  return null;
});

ipcMain.handle("reset-save-folder", async () => {
  const videosFolder = getVideosFolder();
  store.set("saveFolder", videosFolder);
  return videosFolder;
});

ipcMain.handle("start-region-selection", async () => {
  return createRegionSelectionWindow();
});

ipcMain.handle("close-window", () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle("minimize-window", () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle("maximize-window", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle(
  "save-recording",
  async (event, { filePath, arrayBuffer, format }) => {
    try {
      console.log("💾 Saving recording as MP4 to:", filePath);

      // Convert ArrayBuffer to Buffer in main process (Node.js environment)
      const buffer = Buffer.from(arrayBuffer);

      // Always convert to MP4 using ffmpeg
      const dir = path.dirname(filePath);
      const baseName = path.basename(filePath, ".mp4");
      const tempWebmPath = path.join(dir, `${baseName}.temp.webm`);

      // Write temporary WebM file
      fs.writeFileSync(tempWebmPath, buffer);

      // Convert to MP4
      const success = await convertWebmToMp4(tempWebmPath, filePath);

      // Clean up temporary file
      if (fs.existsSync(tempWebmPath)) {
        fs.unlinkSync(tempWebmPath);
      }

      if (success) {
        // Verify the output file exists and has content
        if (!fs.existsSync(filePath)) {
          throw new Error("MP4 file was not created");
        }

        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          throw new Error("MP4 file is empty");
        }

        console.log(
          `✅ MP4 file created successfully: ${filePath} (${stats.size} bytes)`
        );
        return { success: true, filePath };
      } else {
        throw new Error("Failed to convert video to MP4");
      }
    } catch (error) {
      console.error("Error saving recording:", error);
      throw error;
    }
  }
);

function convertWebmToMp4(inputPath, outputPath) {
  return new Promise((resolve) => {
    console.log("Starting WebM to MP4 conversion...");
    console.log("Input:", inputPath);
    console.log("Output:", outputPath);
    console.log("FFmpeg path:", ffmpeg);

    // Check if input file exists and has content
    if (!fs.existsSync(inputPath)) {
      console.error("❌ Input WebM file does not exist:", inputPath);
      resolve(false);
      return;
    }

    const inputStats = fs.statSync(inputPath);
    console.log(`Input file size: ${inputStats.size} bytes`);

    if (inputStats.size === 0) {
      console.error("❌ Input WebM file is empty:", inputPath);
      resolve(false);
      return;
    }

    const ffmpegArgs = [
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-avoid_negative_ts",
      "make_zero",
      "-fflags",
      "+genpts",
      "-y", // Overwrite output file
      outputPath,
    ];

    console.log("FFmpeg command:", ffmpeg, ffmpegArgs.join(" "));
    const ffmpegProcess = spawn(ffmpeg, ffmpegArgs);

    let stderrOutput = "";
    let stdoutOutput = "";

    // Capture stderr for debugging
    ffmpegProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderrOutput += output;
      console.log("FFmpeg stderr:", output);
    });

    // Capture stdout for debugging
    ffmpegProcess.stdout.on("data", (data) => {
      const output = data.toString();
      stdoutOutput += output;
      console.log("FFmpeg stdout:", output);
    });

    ffmpegProcess.on("close", (code) => {
      if (code === 0) {
        console.log(
          "✅ Video conversion successful - MP4 saved to:",
          outputPath
        );
        resolve(true);
      } else {
        console.error("❌ Primary video conversion failed with code:", code);
        console.error("FFmpeg stderr output:", stderrOutput);
        console.error("FFmpeg stdout output:", stdoutOutput);

        // Try fallback conversion with more compatible settings
        console.log("🔄 Trying fallback conversion...");
        tryFallbackConversion(inputPath, outputPath, resolve);
      }
    });

    ffmpegProcess.on("error", (error) => {
      console.error("❌ FFmpeg process error:", error);
      console.error("FFmpeg stderr output:", stderrOutput);
      resolve(false);
    });
  });
}

function tryFallbackConversion(inputPath, outputPath, resolve) {
  console.log("🔄 Attempting fallback conversion with simpler settings...");

  const fallbackArgs = [
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-preset",
    "ultrafast",
    "-crf",
    "28",
    "-r",
    "15", // Lower frame rate
    "-s",
    "1280x720", // Force resolution
    "-y",
    outputPath,
  ];

  console.log("Fallback FFmpeg command:", ffmpeg, fallbackArgs.join(" "));
  const fallbackProcess = spawn(ffmpeg, fallbackArgs);

  let fallbackStderr = "";
  let fallbackStdout = "";

  fallbackProcess.stderr.on("data", (data) => {
    const output = data.toString();
    fallbackStderr += output;
    console.log("Fallback FFmpeg stderr:", output);
  });

  fallbackProcess.stdout.on("data", (data) => {
    const output = data.toString();
    fallbackStdout += output;
    console.log("Fallback FFmpeg stdout:", output);
  });

  fallbackProcess.on("close", (code) => {
    if (code === 0) {
      console.log(
        "✅ Fallback conversion successful - MP4 saved to:",
        outputPath
      );
      resolve(true);
    } else {
      console.error("❌ Fallback conversion also failed with code:", code);
      console.error("Fallback stderr output:", fallbackStderr);
      console.error("Fallback stdout output:", fallbackStdout);
      resolve(false);
    }
  });

  fallbackProcess.on("error", (error) => {
    console.error("❌ Fallback FFmpeg process error:", error);
    resolve(false);
  });
}

let regionSelectionInProgress = false;

function createRegionSelectionWindow() {
  if (regionWindow) {
    regionWindow.focus();
    return false;
  }

  regionSelectionInProgress = true;

  // Get all displays to calculate total bounds
  const displays = screen.getAllDisplays();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Calculate the bounds that encompass all displays
  displays.forEach((display) => {
    const { x, y, width, height } = display.bounds;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;

  regionWindow = new BrowserWindow({
    x: minX,
    y: minY,
    width: totalWidth,
    height: totalHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.js"),
    },
  });

  // Load region selection HTML
  const isDev = !app.isPackaged;
  if (isDev) {
    regionWindow.loadURL("http://localhost:5173/region-selection.html");
  } else {
    regionWindow.loadFile(join(__dirname, "dist/region-selection.html"));
  }

  regionWindow.on("closed", () => {
    // If window closed but no region was set, notify renderer of cancellation
    if (regionSelectionInProgress && mainWindow) {
      mainWindow.webContents.send("region-selection-cancelled");
    }
    regionSelectionInProgress = false;
    regionWindow = null;
  });

  // Send display information to the renderer process
  regionWindow.webContents.once("did-finish-load", () => {
    regionWindow.webContents.send("display-info", {
      displays: displays.map((display) => ({
        id: display.id,
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        primary: display === screen.getPrimaryDisplay(),
      })),
    });
  });

  return true;
}

// Add these IPC handlers after the existing ones

// Register streaming handlers using the defined functions
ipcMain.handle("start-streaming", startStreamingHandler);
ipcMain.handle("stop-streaming", stopStreamingHandler);
ipcMain.handle("pause-streaming", pauseStreamingHandler);
ipcMain.handle("resume-streaming", resumeStreamingHandler);

// Streaming handler functions (defined as separate functions to avoid duplicate registration)
async function startStreamingHandler(event, config) {
  try {
    console.log("Starting streaming with config:", config);

    // Notify renderer about streaming status
    if (mainWindow) {
      mainWindow.webContents.send("streaming-status", {
        isStreaming: true,
        streamingPaused: false,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error starting streaming:", error);
    throw error;
  }
}

async function pauseStreamingHandler() {
  try {
    console.log("Pausing streaming");

    // Notify renderer about streaming status
    if (mainWindow) {
      mainWindow.webContents.send("streaming-status", {
        isStreaming: true,
        streamingPaused: true,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error pausing streaming:", error);
    throw error;
  }
}

async function resumeStreamingHandler() {
  try {
    console.log("Resuming streaming");

    // Notify renderer about streaming status
    if (mainWindow) {
      mainWindow.webContents.send("streaming-status", {
        isStreaming: true,
        streamingPaused: false,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error resuming streaming:", error);
    throw error;
  }
}

async function stopStreamingHandler() {
  try {
    console.log("Stopping streaming");

    // Notify renderer about streaming status
    if (mainWindow) {
      mainWindow.webContents.send("streaming-status", {
        isStreaming: false,
        streamingPaused: false,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error stopping streaming:", error);
    throw error;
  }
}

// Update the existing recording handlers to also handle streaming
ipcMain.handle("start-recording", async (event, options) => {
  try {
    console.log("Starting recording with options:", options);

    // Start streaming as well
    await startStreamingHandler(event, {
      openaiApiKey: options.openaiApiKey,
      region: options.region,
      devices: options.devices,
    });

    // Notify renderer about recording status
    if (mainWindow) {
      mainWindow.webContents.send("recording-status", {
        isRecording: true,
        isPaused: false,
        isStreaming: true,
        streamingPaused: false,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error starting recording:", error);
    throw error;
  }
});

ipcMain.handle("pause-recording", async () => {
  try {
    console.log("Pausing recording and streaming");

    // Pause streaming as well
    await pauseStreamingHandler();

    // Notify renderer about recording status
    if (mainWindow) {
      mainWindow.webContents.send("recording-status", {
        isRecording: true,
        isPaused: true,
        isStreaming: true,
        streamingPaused: true,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error pausing recording:", error);
    throw error;
  }
});

ipcMain.handle("resume-recording", async () => {
  try {
    console.log("Resuming recording and streaming");

    // Resume streaming as well
    await resumeStreamingHandler();

    // Notify renderer about recording status
    if (mainWindow) {
      mainWindow.webContents.send("recording-status", {
        isRecording: true,
        isPaused: false,
        isStreaming: true,
        streamingPaused: false,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error resuming recording:", error);
    throw error;
  }
});

ipcMain.handle("stop-recording", async () => {
  try {
    console.log("Stopping recording and streaming");

    // Stop streaming as well
    await stopStreamingHandler();

    // Notify renderer about recording status
    if (mainWindow) {
      mainWindow.webContents.send("recording-status", {
        isRecording: false,
        isPaused: false,
        isStreaming: false,
        streamingPaused: false,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error stopping recording:", error);
    throw error;
  }
});

ipcMain.handle("close-region-selection", async () => {
  if (regionWindow) {
    regionWindow.close();
  }

  return true;
});

// App event listeners
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
