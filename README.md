# Electron Copilot

Electron Copilot is an Electron-based desktop application that captures your screen and audio in real time and streams them to the OpenAI Realtime API to provide contextual assistance while you work.

## ✨ Current Status

### 🎯 **WORKING NOW: MP4 Recording**
The core recording functionality is **fully operational**:
- ✅ **Device Selection** – Choose microphone and speakers
- ✅ **Region Selection** – Snipping-tool-style area selection from primary screen
- ✅ **Multi-stream Recording** – Combines microphone + system audio + screen capture
- ✅ **MP4 Export** – Automatic conversion from WebM to MP4 using ffmpeg
- ✅ **Pause/Resume** – Full recording control with coordinated streaming pause
- ✅ **Real-time UI** – Live recording timer, device status, and controls

### 🚧 **IN PROGRESS: OpenAI Integration**
The streaming infrastructure is built but not yet connected to OpenAI:
- ✅ WebRTC foundation ready
- ✅ Screenshot capture every 5 seconds
- ✅ Audio streaming pipeline
- ⏳ **OpenAI Realtime API connection** (next milestone)
- ⏳ **AI assistant responses** (next milestone)

## 🎮 **Try It Now**

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run the application**
   ```bash
   npm run start
   ```

3. **Test MP4 recording**
   - Click **Configure** to select your microphone and speakers
   - Click **Start Recording** to select a screen region
   - Record your screen with audio
   - Click **Stop** to save as MP4

## 📁 Current Architecture

```
├─ main.js                    # ✅ Electron main process + IPC handlers
├─ preload.js                 # ✅ Secure IPC bridge
├─ src/
│  ├─ App.jsx                 # ✅ Main application UI
│  ├─ components/
│  │  ├─ ui/                  # ✅ shadcn/ui components
│  │  └─ DevicePreferences.jsx # ✅ Device selection modal
│  └─ services/
│     └─ MediaCapture.js      # ✅ Recording + streaming engine
├─ public/
│  └─ region-selection.html   # ✅ Screen region selector
└─ package.json               # ✅ Dependencies + scripts
```

## ✅ **Completed Features**

### Core Recording System
- [x] **Device Management** – Enumerate and select audio/video devices
- [x] **Device Testing** – Live microphone volume meters and device validation
- [x] **Region Selection** – Interactive screen area selection with overlay
- [x] **Multi-stream Capture** – Microphone + system audio + screen recording
- [x] **Audio Mixing** – Web Audio API integration for combined audio streams
- [x] **MP4 Export** – WebM recording with ffmpeg conversion to MP4
- [x] **Pause/Resume** – Coordinated recording and streaming pause/resume
- [x] **Settings Persistence** – Device selections and regions saved across sessions

### User Interface
- [x] **Modern UI** – React + shadcn/ui components with dark/light theme support
- [x] **Recording Controls** – Start/stop/pause with real-time status
- [x] **Device Status** – Visual indicators for microphone, screen, and audio
- [x] **Connection Status** – Streaming state with pause/active indicators
- [x] **Error Handling** – User-friendly error messages and recovery
- [x] **Responsive Layout** – Collapsible AI assistant sidebar

### Technical Foundation
- [x] **Secure IPC** – Preload script with contextIsolation
- [x] **Menu Integration** – Native menu with device preferences and shortcuts
- [x] **File Operations** – Save dialog integration with MP4/WebM support
- [x] **Cross-platform** – Windows, macOS, Linux support via Electron

## 🎯 **Next Milestones**

### 1. OpenAI Integration (Priority 1)
- [ ] **OpenAI API Key Management** – Secure storage and configuration
- [ ] **Realtime API Connection** – WebRTC signaling to OpenAI endpoint
- [ ] **Audio Streaming** – Send microphone + system audio to OpenAI
- [ ] **Screenshot Transmission** – Send screen captures via data channel
- [ ] **Response Handling** – Process and display OpenAI responses

### 2. AI Assistant Features (Priority 2)
- [ ] **Chat Interface** – Functional sidebar with message history
- [ ] **Response Display** – Real-time AI assistance and suggestions
- [ ] **Message Persistence** – Save conversation history locally
- [ ] **Follow-up Questions** – User input for additional queries
- [ ] **Context Awareness** – Screen content understanding

### 3. Production Ready (Priority 3)
- [ ] **Connection Reliability** – Retry logic and error recovery
- [ ] **Logging System** – Comprehensive error tracking
- [ ] **Performance Optimization** – Resource usage monitoring
- [ ] **Build Pipeline** – electron-builder configuration
- [ ] **Auto-updates** – GitHub releases integration
- [ ] **Security Audit** – Final security review

## 🔧 **Development Commands**

```bash
# Development
npm run start          # Start Vite + Electron in development mode
npm run dev           # Start Vite dev server only
npm run electron      # Start Electron only

# Production (coming soon)
npm run build         # Build renderer for production
npm run dist          # Create platform-specific installers
```

## 🎥 **Recording Capabilities**

The application currently supports:
- **Video**: Screen/window capture with region cropping
- **Audio**: Microphone + system audio mixing
- **Formats**: WebM (native) → MP4 (converted)
- **Quality**: 8 Mbps video, 128 kbps audio, 30fps
- **Features**: Pause/resume, real-time preview, device switching

## 🚀 **Getting Started Guide**

1. **Launch the app** → `npm run start`
2. **Configure devices** → Click "Configure" to select microphone and screen
3. **Select region** → Click "Start Recording" to choose screen area
4. **Record** → Your screen and audio will be captured
5. **Save** → Click "Stop" to export as MP4

## 📋 **Technical Requirements**

- **Node.js**: 22 LTS or higher
- **OS**: Windows 10+, macOS 10.14+, or Linux (Ubuntu 18.04+)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 100MB for app + space for recordings

## 🔮 **Future Vision**

Once OpenAI integration is complete, Electron Copilot will:
- Provide real-time contextual assistance based on screen content
- Answer questions about what you're working on
- Suggest improvements to code, documents, or workflows
- Maintain conversation history across recording sessions
- Work offline with cached AI responses

---

**Current Focus**: The foundation is solid – next step is connecting to OpenAI's Realtime API to bring the AI assistant to life! 🤖

