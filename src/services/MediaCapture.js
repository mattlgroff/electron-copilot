class MediaCapture {
  constructor(
    onRecordingSaved = null,
    onRecordingStarted = null,
    onRecordingError = null
  ) {
    this.microphoneStream = null;
    this.screenStream = null;
    this.systemAudioStream = null;
    this.combinedStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.isPaused = false;
    this.audioContext = null;
    this.destination = null;
    this.onRecordingSaved = onRecordingSaved;
    this.onRecordingStarted = onRecordingStarted;
    this.onRecordingError = onRecordingError;

    // Streaming properties
    this.peerConnection = null;
    this.dataChannel = null;
    this.isStreaming = false;
    this.streamingPaused = false;
    this.screenshotInterval = null;
    this.lastScreenshotTime = 0;
  }

  async setupSystemAudio() {
    try {
      if (this.systemAudioStream) {
        this.systemAudioStream.getTracks().forEach((track) => track.stop());
      }

      console.log("🔊 Attempting to capture system audio separately...");

      // Get available audio sources from Electron
      const sources = await window.electronAPI.enumerateDevices();

      // Look for audio sources (screens that might have audio)
      const audioSources = sources.screens.filter(
        (source) =>
          source.name.toLowerCase().includes("audio") ||
          source.name.toLowerCase().includes("sound") ||
          source.name.toLowerCase().includes("entire screen")
      );

      if (audioSources.length === 0) {
        console.warn("⚠️ No audio sources found");
        return false;
      }

      const audioSource = audioSources[0];
      console.log("🔊 Using audio source:", audioSource.name);

      // Try to capture audio-only from the screen
      const audioConstraints = {
        audio: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: audioSource.id,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            googEchoCancellation: false,
            googNoiseSuppression: false,
            googAutoGainControl: false,
            googHighpassFilter: false,
            googTypingNoiseDetection: false,
          },
        },
      };

      this.systemAudioStream = await navigator.mediaDevices.getUserMedia(
        audioConstraints
      );

      const audioTracks = this.systemAudioStream.getAudioTracks();
      console.log(
        `✅ System audio capture successful - tracks: ${audioTracks.length}`
      );

      return true;
    } catch (error) {
      console.error("❌ System audio capture failed:", error);
      return false;
    }
  }

  async setupMicrophone(deviceId) {
    try {
      if (this.microphoneStream) {
        this.microphoneStream.getTracks().forEach((track) => track.stop());
      }

      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      };

      this.microphoneStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );
      console.log("Microphone stream setup successful");
      return true;
    } catch (error) {
      console.error("Error setting up microphone:", error);
      throw error;
    }
  }

  async setupScreenCapture(sourceId, region) {
    try {
      if (this.screenStream) {
        this.screenStream.getTracks().forEach((track) => track.stop());
      }

      // Get screen source from Electron
      const sources = await window.electronAPI.enumerateDevices();

      // If no sourceId provided, use the primary screen
      let source;
      if (sourceId) {
        source = [...sources.screens, ...sources.windows].find(
          (s) => s.id === sourceId
        );
      } else {
        // Default to the first screen (primary screen)
        source =
          sources.screens && sources.screens.length > 0
            ? sources.screens[0]
            : null;
      }

      if (!source) {
        throw new Error("No screen source available");
      }

      // Try with audio first, fall back to video-only if audio fails
      let screenStream = null;

      try {
        // First attempt: try to capture both video and audio
        const constraintsWithAudio = {
          audio: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: source.id,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              googEchoCancellation: false,
              googNoiseSuppression: false,
              googAutoGainControl: false,
              googHighpassFilter: false,
              googTypingNoiseDetection: false,
            },
          },
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080,
              minFrameRate: 30,
              maxFrameRate: 60,
            },
          },
        };

        screenStream = await navigator.mediaDevices.getUserMedia(
          constraintsWithAudio
        );

        // Check if we actually got audio
        const audioTracks = screenStream.getAudioTracks();
        console.log(
          `Screen capture with audio successful - audio tracks: ${audioTracks.length}`
        );

        if (audioTracks.length > 0) {
          console.log("✅ Desktop audio capture successful");
        } else {
          console.warn("⚠️ No audio tracks found in screen capture");
        }
      } catch (audioError) {
        console.warn(
          "Audio capture failed, trying video-only:",
          audioError.message
        );

        // Second attempt: video-only capture
        const constraintsVideoOnly = {
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080,
              minFrameRate: 30,
              maxFrameRate: 60,
            },
          },
        };

        screenStream = await navigator.mediaDevices.getUserMedia(
          constraintsVideoOnly
        );
        console.log("Screen capture (video-only) successful");
      }

      this.screenStream = screenStream;

      // If region is specified, we'll need to crop the video
      if (region) {
        this.screenStream = await this.cropVideoStream(
          this.screenStream,
          region
        );
      }

      console.log("Screen capture setup successful");
      return true;
    } catch (error) {
      console.error("Error setting up screen capture:", error);
      throw error;
    }
  }

  async cropVideoStream(stream, region) {
    try {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.play();

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = region.width;
      canvas.height = region.height;

      const drawFrame = () => {
        if (video.videoWidth && video.videoHeight) {
          ctx.drawImage(
            video,
            region.x,
            region.y,
            region.width,
            region.height,
            0,
            0,
            region.width,
            region.height
          );
        }
        if (this.isRecording) {
          requestAnimationFrame(drawFrame);
        }
      };

      video.addEventListener("loadedmetadata", () => {
        drawFrame();
      });

      // Create a new stream from the canvas
      const croppedStream = canvas.captureStream(30);

      // Add the system audio track from the original stream
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        croppedStream.addTrack(audioTrack);
      }

      return croppedStream;
    } catch (error) {
      console.error("Error cropping video stream:", error);
      throw error;
    }
  }

  async combineStreams() {
    try {
      if (!this.microphoneStream && !this.screenStream) {
        throw new Error("No streams available to combine");
      }

      // Create audio context for mixing
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this.destination = this.audioContext.createMediaStreamDestination();

      console.log("🎵 Combining audio streams...");

      // Add microphone audio if available
      if (this.microphoneStream) {
        const micTracks = this.microphoneStream.getAudioTracks();
        console.log(`🎤 Microphone audio tracks: ${micTracks.length}`);

        if (micTracks.length > 0) {
          const micSource = this.audioContext.createMediaStreamSource(
            this.microphoneStream
          );
          const micGain = this.audioContext.createGain();
          micGain.gain.value = 0.8; // Adjust microphone volume
          micSource.connect(micGain);
          micGain.connect(this.destination);
          console.log("✅ Microphone audio added to mix");
        }
      }

      // Add system audio if available (from screen stream or separate audio stream)
      let systemAudioAdded = false;

      // First try system audio from screen stream
      if (this.screenStream) {
        const systemAudioTracks = this.screenStream.getAudioTracks();
        console.log(
          `🔊 Screen stream audio tracks: ${systemAudioTracks.length}`
        );

        if (systemAudioTracks.length > 0) {
          const systemAudioTrack = systemAudioTracks[0];
          console.log(`🔊 Screen audio track details:`, {
            id: systemAudioTrack.id,
            label: systemAudioTrack.label,
            kind: systemAudioTrack.kind,
            enabled: systemAudioTrack.enabled,
            muted: systemAudioTrack.muted,
            readyState: systemAudioTrack.readyState,
          });

          const systemSource = this.audioContext.createMediaStreamSource(
            new MediaStream([systemAudioTrack])
          );
          const systemGain = this.audioContext.createGain();
          systemGain.gain.value = 1.0; // System audio volume
          systemSource.connect(systemGain);
          systemGain.connect(this.destination);
          console.log("✅ Screen audio added to mix");
          systemAudioAdded = true;
        }
      }

      // If no audio from screen stream, try separate system audio stream
      if (!systemAudioAdded && this.systemAudioStream) {
        const systemAudioTracks = this.systemAudioStream.getAudioTracks();
        console.log(
          `🔊 Separate system audio tracks: ${systemAudioTracks.length}`
        );

        if (systemAudioTracks.length > 0) {
          const systemAudioTrack = systemAudioTracks[0];
          console.log(`🔊 Separate audio track details:`, {
            id: systemAudioTrack.id,
            label: systemAudioTrack.label,
            kind: systemAudioTrack.kind,
            enabled: systemAudioTrack.enabled,
            muted: systemAudioTrack.muted,
            readyState: systemAudioTrack.readyState,
          });

          const systemSource = this.audioContext.createMediaStreamSource(
            this.systemAudioStream
          );
          const systemGain = this.audioContext.createGain();
          systemGain.gain.value = 1.0; // System audio volume
          systemSource.connect(systemGain);
          systemGain.connect(this.destination);
          console.log("✅ Separate system audio added to mix");
          systemAudioAdded = true;
        }
      }

      if (!systemAudioAdded) {
        console.warn("⚠️ No system audio available from any source");
      }

      // Create combined stream
      this.combinedStream = new MediaStream();

      // Add video track from screen capture
      if (this.screenStream) {
        const videoTrack = this.screenStream.getVideoTracks()[0];
        if (videoTrack) {
          this.combinedStream.addTrack(videoTrack);
        }
      }

      // Add combined audio track
      const audioTrack = this.destination.stream.getAudioTracks()[0];
      if (audioTrack) {
        this.combinedStream.addTrack(audioTrack);
      }

      console.log("Streams combined successfully");
      return this.combinedStream;
    } catch (error) {
      console.error("Error combining streams:", error);
      throw error;
    }
  }

  async startRecording() {
    try {
      if (!this.combinedStream) {
        throw new Error("No combined stream available");
      }

      this.recordedChunks = [];

      // Try different codec combinations for better compatibility
      let options;
      let mimeType;

      // Test supported MIME types in order of preference
      const mimeTypes = [
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=h264,opus",
        "video/webm",
      ];

      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      if (!mimeType) {
        throw new Error("No supported video MIME type found");
      }

      console.log(`📹 Using MIME type: ${mimeType}`);

      options = {
        mimeType: mimeType,
        videoBitsPerSecond: 4000000, // 4 Mbps (reduced for stability)
        audioBitsPerSecond: 128000, // 128 kbps
      };

      this.mediaRecorder = new MediaRecorder(this.combinedStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        console.log("Recording stopped, processing...");
        try {
          await this.processRecording();
        } catch (error) {
          console.error("Error in mediaRecorder.onstop:", error);
          // The error handling is already done in processRecording
        }
      };

      this.mediaRecorder.start(1000); // Collect data every second
      this.isRecording = true;
      this.isPaused = false;

      console.log("Recording started");

      // Notify that recording has actually started
      if (this.onRecordingStarted) {
        this.onRecordingStarted();
      }

      return true;
    } catch (error) {
      console.error("Error starting recording:", error);
      throw error;
    }
  }

  async startStreaming(config) {
    try {
      if (!this.combinedStream) {
        throw new Error("No combined stream available for streaming");
      }

      // Create RTCPeerConnection for OpenAI Realtime API
      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      // Create data channel for screenshots
      this.dataChannel = this.peerConnection.createDataChannel("screenshots", {
        ordered: true,
      });

      // Add audio track to peer connection
      const audioTrack = this.combinedStream.getAudioTracks()[0];
      if (audioTrack) {
        this.peerConnection.addTrack(audioTrack, this.combinedStream);
      }

      // Set up screenshot interval (every 5 seconds)
      this.screenshotInterval = setInterval(() => {
        if (this.isStreaming && !this.streamingPaused) {
          this.captureAndSendScreenshot();
        }
      }, 5000);

      this.isStreaming = true;
      this.streamingPaused = false;

      console.log("Streaming started");
      return true;
    } catch (error) {
      console.error("Error starting streaming:", error);
      throw error;
    }
  }

  async pauseRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause();
      this.isPaused = true;
      console.log("Recording paused");
    }

    // Also pause streaming
    await this.pauseStreaming();
  }

  async resumeRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume();
      this.isPaused = false;
      console.log("Recording resumed");
    }

    // Also resume streaming
    await this.resumeStreaming();
  }

  async stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.isPaused = false;
      console.log("Recording stopped");
    }

    // Also stop streaming
    await this.stopStreaming();
  }

  async processRecording() {
    try {
      if (this.recordedChunks.length === 0) {
        console.warn("No recorded chunks to process");
        return null;
      }

      console.log(
        `📊 Processing ${this.recordedChunks.length} recorded chunks`
      );

      // Log chunk information
      let totalSize = 0;
      this.recordedChunks.forEach((chunk, index) => {
        totalSize += chunk.size;
        console.log(`Chunk ${index}: ${chunk.size} bytes, type: ${chunk.type}`);
      });

      console.log(
        `📊 Total recording size: ${totalSize} bytes (${(
          totalSize /
          1024 /
          1024
        ).toFixed(2)} MB)`
      );

      const blob = new Blob(this.recordedChunks, { type: "video/webm" });
      console.log(`📦 Created blob: ${blob.size} bytes, type: ${blob.type}`);

      // Show save dialog (MP4 only)
      const result = await window.electronAPI.showSaveDialog({
        filters: [{ name: "MP4 Video Files", extensions: ["mp4"] }],
      });

      if (!result.canceled && result.filePath) {
        console.log("💾 Converting to MP4...");

        // Always convert to MP4 using ffmpeg (handled by main process)
        const arrayBuffer = await blob.arrayBuffer();
        console.log(`📦 ArrayBuffer created: ${arrayBuffer.byteLength} bytes`);

        // Ensure file path ends with .mp4
        const mp4FilePath = result.filePath.endsWith(".mp4")
          ? result.filePath
          : result.filePath + ".mp4";

        console.log(`💾 Saving to: ${mp4FilePath}`);

        // Send ArrayBuffer directly to main process (always MP4 format)
        await window.electronAPI.saveRecording({
          filePath: mp4FilePath,
          arrayBuffer: arrayBuffer,
          format: "mp4",
        });

        console.log("✅ Recording saved successfully to:", mp4FilePath);

        // Call the callback if provided
        if (this.onRecordingSaved) {
          this.onRecordingSaved(mp4FilePath);
        }

        return mp4FilePath;
      }

      return null;
    } catch (error) {
      console.error("❌ Error processing recording:", error);

      // Notify about recording error
      if (this.onRecordingError) {
        this.onRecordingError(error.message);
      }

      throw error;
    }
  }

  async pauseStreaming() {
    if (this.isStreaming && !this.streamingPaused) {
      this.streamingPaused = true;

      // Pause audio tracks
      const audioTracks = this.combinedStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = false;
      });

      console.log("Streaming paused");
      return true;
    }
    return false;
  }

  async resumeStreaming() {
    if (this.isStreaming && this.streamingPaused) {
      this.streamingPaused = false;

      // Resume audio tracks
      const audioTracks = this.combinedStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = true;
      });

      console.log("Streaming resumed");
      return true;
    }
    return false;
  }

  async stopStreaming() {
    if (this.isStreaming) {
      this.isStreaming = false;
      this.streamingPaused = false;

      // Clear screenshot interval
      if (this.screenshotInterval) {
        clearInterval(this.screenshotInterval);
        this.screenshotInterval = null;
      }

      // Close peer connection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      // Close data channel
      if (this.dataChannel) {
        this.dataChannel.close();
        this.dataChannel = null;
      }

      console.log("Streaming stopped");
      return true;
    }
    return false;
  }

  async captureAndSendScreenshot() {
    try {
      if (
        !this.screenStream ||
        !this.dataChannel ||
        this.dataChannel.readyState !== "open"
      ) {
        return;
      }

      const videoTrack = this.screenStream.getVideoTracks()[0];
      if (!videoTrack) return;

      // Create a canvas to capture the frame
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const video = document.createElement("video");

      video.srcObject = new MediaStream([videoTrack]);
      video.play();

      video.addEventListener("loadedmetadata", () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        // Convert to PNG blob
        canvas.toBlob((blob) => {
          if (
            blob &&
            this.dataChannel &&
            this.dataChannel.readyState === "open"
          ) {
            blob.arrayBuffer().then((buffer) => {
              this.dataChannel.send(buffer);
              console.log("Screenshot sent via data channel");
            });
          }
        }, "image/png");
      });
    } catch (error) {
      console.error("Error capturing screenshot:", error);
    }
  }

  cleanup() {
    // Stop streaming first
    this.stopStreaming();

    // Stop all streams
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach((track) => track.stop());
      this.microphoneStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
    }

    if (this.systemAudioStream) {
      this.systemAudioStream.getTracks().forEach((track) => track.stop());
      this.systemAudioStream = null;
    }

    if (this.combinedStream) {
      this.combinedStream.getTracks().forEach((track) => track.stop());
      this.combinedStream = null;
    }

    // Clean up audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clean up media recorder
    if (this.mediaRecorder) {
      this.mediaRecorder = null;
    }

    this.recordedChunks = [];
    this.isRecording = false;
    this.isPaused = false;
    this.isStreaming = false;
    this.streamingPaused = false;

    console.log("MediaCapture cleanup completed");
  }

  getRecordingStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      isStreaming: this.isStreaming,
      streamingPaused: this.streamingPaused,
      hasStreams: !!(this.microphoneStream || this.screenStream),
      recordingState: this.mediaRecorder
        ? this.mediaRecorder.state
        : "inactive",
    };
  }
}

export default MediaCapture;
