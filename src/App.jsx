import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import DevicePreferences from "@/components/DevicePreferences";
import MediaCapture from "./services/MediaCapture";
import { 
  Play, 
  Square, 
  Pause, 
  Settings, 
  Monitor, 
  Mic, 
  Volume2, 
  MessageCircle,
  Minimize2,
  Maximize2,
  X,
  Folder,
  FolderOpen
} from "lucide-react";

export default function App() {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState({
    microphone: 'disconnected',
    systemAudio: 'disconnected'
  });
  const [selectedDevices, setSelectedDevices] = useState({
    microphone: null,
    speaker: null
  });
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingPaused, setStreamingPaused] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [devicePreferencesOpen, setDevicePreferencesOpen] = useState(false);
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);
  const [recordingError, setRecordingError] = useState(null);
  const [isChangingRegion, setIsChangingRegion] = useState(false);
  const [saveFolder, setSaveFolder] = useState('');
  const [waitingForRegionSelection, setWaitingForRegionSelection] = useState(false);
  
  const mediaCaptureRef = useRef(null);
  const timerRef = useRef(null);

  // Format recording time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize MediaCapture service
  useEffect(() => {
    const handleRecordingSaved = (filePath) => {
      const fileName = filePath.split('\\').pop().split('/').pop(); // Get just the filename
      toast({
        title: "Recording Saved Successfully! 🎥",
        description: `Your MP4 recording has been saved as ${fileName}`,
        duration: 5000,
      });
    };

    const handleRecordingStarted = () => {
      console.log("Recording has actually started - starting timer");
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
    };

    const handleRecordingError = (errorMessage) => {
      toast({
        title: "❌ Recording Error",
        description: errorMessage,
        duration: 5000,
        variant: "destructive",
      });
    };

    mediaCaptureRef.current = new MediaCapture(
      handleRecordingSaved,
      handleRecordingStarted,
      handleRecordingError
    );


    // Load save folder on startup
    loadSaveFolder();

    return () => {
      if (mediaCaptureRef.current) {
        mediaCaptureRef.current.cleanup();
      }
    };
  }, [toast]);

  // Recording timer effect
  useEffect(() => {
    let interval;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Initialize electron API listeners and load default devices
  useEffect(() => {
    if (window.electronAPI) {
      // Listen for recording status events
      window.electronAPI.onRecordingStatus((event, status) => {
        setIsRecording(status.isRecording);
        setIsPaused(status.isPaused);
        setIsStreaming(status.isStreaming || false);
        setStreamingPaused(status.streamingPaused || false);
      });

      // Listen for streaming status events
      window.electronAPI.onStreamingStatus((event, status) => {
        setIsStreaming(status.isStreaming);
        setStreamingPaused(status.streamingPaused);
        setIsConnected(status.isStreaming); // Connected when streaming is active
      });

      // Get stored region on startup
      window.electronAPI.getStoredRegion().then(region => {
        setSelectedRegion(region);
      });

      // Load saved device selections and set defaults
      loadSavedDevices();

      // Listen for region selection events
      const handleRegionSelected = (event, region) => {
        setSelectedRegion(region);
        setWaitingForRegionSelection(false);
        // Continue with recording setup now that region is selected
        continueRecordingSetup(region);
      };

      // Add event listener for region selection
      if (window.electronAPI.onRegionSelected) {
        window.electronAPI.onRegionSelected(handleRegionSelected);
      }

      // Add event listener for region selection cancellation
      const handleRegionSelectionCancelled = () => {
        console.log('Region selection was cancelled');
        setWaitingForRegionSelection(false);
        setIsSetupInProgress(false);
        setRecordingError('Region selection was cancelled');
      };

      if (window.electronAPI.onRegionSelectionCancelled) {
        window.electronAPI.onRegionSelectionCancelled(handleRegionSelectionCancelled);
      }

      // Clean up event listeners on unmount
      return () => {
        if (window.electronAPI.removeListener) {
          window.electronAPI.removeListener('region-selected', handleRegionSelected);
          window.electronAPI.removeListener('region-selection-cancelled', handleRegionSelectionCancelled);
        }
      };
    }
  }, []);

  const loadSavedDevices = async () => {
    try {
      // Load saved device selections
      const savedMic = await window.electronAPI.getSetting('selectedDevice.microphone');
      const savedSpeaker = await window.electronAPI.getSetting('selectedDevice.speaker');

      // Get available devices to set defaults if nothing is saved
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const defaultMic = mediaDevices.find(device => device.kind === 'audioinput' && device.deviceId !== 'default');
      const defaultSpeaker = mediaDevices.find(device => device.kind === 'audiooutput' && device.deviceId !== 'default');

      const newSelectedDevices = {
        microphone: savedMic || (defaultMic ? defaultMic.deviceId : null),
        speaker: savedSpeaker || (defaultSpeaker ? defaultSpeaker.deviceId : null)
      };

      setSelectedDevices(newSelectedDevices);
      handleDeviceSelect(newSelectedDevices);

      // Save defaults if they weren't already saved
      if (!savedMic && defaultMic) {
        await window.electronAPI.selectDevice(defaultMic.deviceId, 'microphone');
      }
      if (!savedSpeaker && defaultSpeaker) {
        await window.electronAPI.selectDevice(defaultSpeaker.deviceId, 'speaker');
      }
    } catch (error) {
      console.error('Error loading saved devices:', error);
    }
  };

  const handleStartRecording = async () => {
    try {
      setIsSetupInProgress(true);
      setRecordingError(null);
      setWaitingForRegionSelection(true);
      
      // Always start with region selection when recording starts
      const success = await window.electronAPI.startRegionSelection();
      if (!success) {
        setIsSetupInProgress(false);
        setWaitingForRegionSelection(false);
        return;
      }
      // Region selection window will handle the rest via the onRegionSelected callback
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setRecordingError(error.message);
      setIsSetupInProgress(false);
      setWaitingForRegionSelection(false);
    }
  };

  // Continue recording setup after region is selected
  const continueRecordingSetup = async (region) => {
    try {
      const mediaCapture = mediaCaptureRef.current;
      
      // Ensure devices are loaded before continuing
      let currentDevices = selectedDevices;
      if (!currentDevices.microphone) {
        console.log('Devices not loaded yet, loading now...');
        
        // Load device information directly
        const savedMic = await window.electronAPI.getSetting('selectedDevice.microphone');
        const savedSpeaker = await window.electronAPI.getSetting('selectedDevice.speaker');

        // Get available devices to set defaults if nothing is saved
        const mediaDevices = await navigator.mediaDevices.enumerateDevices();
        const defaultMic = mediaDevices.find(device => device.kind === 'audioinput' && device.deviceId !== 'default');
        const defaultSpeaker = mediaDevices.find(device => device.kind === 'audiooutput' && device.deviceId !== 'default');

        currentDevices = {
          microphone: savedMic || (defaultMic ? defaultMic.deviceId : null),
          speaker: savedSpeaker || (defaultSpeaker ? defaultSpeaker.deviceId : null)
        };
        
        // Update state
        setSelectedDevices(currentDevices);
        handleDeviceSelect(currentDevices);
        
        // Save defaults if they weren't already saved
        if (!savedMic && defaultMic) {
          await window.electronAPI.selectDevice(defaultMic.deviceId, 'microphone');
        }
        if (!savedSpeaker && defaultSpeaker) {
          await window.electronAPI.selectDevice(defaultSpeaker.deviceId, 'speaker');
        }
      }
      
      // Setup microphone if selected
      if (currentDevices.microphone) {
        await mediaCapture.setupMicrophone(currentDevices.microphone);
      }
      
      // Setup screen capture with region (always use primary screen)
      await mediaCapture.setupScreenCapture(null, region);
      
      // Check if we have at least one stream
      if (!currentDevices.microphone) {
        throw new Error('Please select a microphone in Device Preferences');
      }
      
      // Combine streams
      await mediaCapture.combineStreams();
      
      // Start recording (this will trigger handleRecordingStarted callback)
      await mediaCapture.startRecording();
      
      // Start streaming
      await mediaCapture.startStreaming({
        region: region,
        devices: currentDevices
      });
      
      // Recording state will be set by handleRecordingStarted callback
      setIsStreaming(true);
      setStreamingPaused(false);
      
      // Send status to main process
      if (window.electronAPI) {
        await window.electronAPI.startRecording({
          region: region,
          devices: currentDevices
        });
      }
      
    } catch (error) {
      console.error('Error setting up recording:', error);
      setRecordingError(error.message);
      setIsRecording(false);
      setIsPaused(false);
      setIsStreaming(false);
      setStreamingPaused(false);
    } finally {
      setIsSetupInProgress(false);
    }
  };

  const handleStopRecording = async () => {
    try {
      const mediaCapture = mediaCaptureRef.current;
      
      if (mediaCapture) {
        await mediaCapture.stopRecording();
      }
      
      setIsRecording(false);
      setIsPaused(false);
      setIsStreaming(false);
      setStreamingPaused(false);
      setIsConnected(false);
      setRecordingTime(0); // Reset timer to 0
      
      if (window.electronAPI) {
        await window.electronAPI.stopRecording();
      }
      
    } catch (error) {
      console.error('Error stopping recording:', error);
      setRecordingError(error.message);
    }
  };

  const handlePauseRecording = async () => {
    try {
      const mediaCapture = mediaCaptureRef.current;
      
      if (mediaCapture) {
        if (isPaused) {
          await mediaCapture.resumeRecording();
        } else {
          await mediaCapture.pauseRecording();
        }
      }
      
      setIsPaused(!isPaused);
      setStreamingPaused(!isPaused);
      
      if (window.electronAPI) {
        if (isPaused) {
          await window.electronAPI.resumeRecording();
        } else {
          await window.electronAPI.pauseRecording();
        }
      }
      
    } catch (error) {
      console.error('Error pausing/resuming recording:', error);
      setRecordingError(error.message);
    }
  };

  const handleOpenSettings = () => {
    setDevicePreferencesOpen(true);
  };

  const handleDeviceSelect = (newSelectedDevices) => {
    setSelectedDevices(newSelectedDevices);
    setDeviceStatus({
      microphone: newSelectedDevices.microphone ? 'connected' : 'disconnected',
      systemAudio: newSelectedDevices.microphone ? 'connected' : 'disconnected'
    });
  };

  const handleChangeRegion = async () => {
    if (!isRecording) return;
    
    try {
      setIsChangingRegion(true);
      
      // Open region selection overlay
      const success = await window.electronAPI.startRegionSelection();
      if (!success) {
        setIsChangingRegion(false);
        return;
      }
      
      // The region selection will be handled by the onRegionSelected callback
      // which will update the recording with the new region
      
    } catch (error) {
      console.error('Error changing region:', error);
      setRecordingError(error.message);
      setIsChangingRegion(false);
    }
  };

  // Listen for region selection completion
  useEffect(() => {
    if (selectedRegion && waitingForRegionSelection && isSetupInProgress) {
      // Region was freshly selected from UI, continue with recording setup
      setWaitingForRegionSelection(false);
      continueRecordingSetup(selectedRegion);
    } else if (selectedRegion && isChangingRegion) {
      // Region was changed during recording, update the recording
      updateRecordingRegion(selectedRegion);
    }
  }, [selectedRegion, waitingForRegionSelection, isSetupInProgress, isChangingRegion]);

  const updateRecordingRegion = async (newRegion) => {
    try {
      const mediaCapture = mediaCaptureRef.current;
      
      if (mediaCapture && selectedDevices.microphone) {
        // Update the screen capture with new region
        await mediaCapture.setupScreenCapture(null, newRegion);
        
        // If we need to restart the combined stream
        if (isRecording && !isPaused) {
          await mediaCapture.combineStreams();
        }
        
        console.log('Recording region updated successfully');
      }
      
    } catch (error) {
      console.error('Error updating recording region:', error);
      setRecordingError('Failed to update recording region: ' + error.message);
    } finally {
      setIsChangingRegion(false);
    }
  };

  const loadSaveFolder = async () => {
    try {
      const folder = await window.electronAPI.getSaveFolder();
      setSaveFolder(folder);
    } catch (error) {
      console.error('Error loading save folder:', error);
    }
  };

  const handleChooseSaveFolder = async () => {
    try {
      const newFolder = await window.electronAPI.chooseSaveFolder();
      if (newFolder) {
        setSaveFolder(newFolder);
      }
    } catch (error) {
      console.error('Error choosing save folder:', error);
      setRecordingError('Failed to select save folder: ' + error.message);
    }
  };

  const handleResetSaveFolder = async () => {
    try {
      const defaultFolder = await window.electronAPI.resetSaveFolder();
      setSaveFolder(defaultFolder);
    } catch (error) {
      console.error('Error resetting save folder:', error);
      setRecordingError('Failed to reset save folder: ' + error.message);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${sidebarOpen ? 'mr-80' : ''}`}>
        {/* Header Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-800">Electron Copilot</h1>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {isConnected ? (streamingPaused ? 'Streaming Paused' : 'Streaming Active') : 'Disconnected'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.electronAPI?.minimizeWindow()}>
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.electronAPI?.maximizeWindow()}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.electronAPI?.closeWindow()}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Control Panel */}
        <div className="flex-1 p-6">
          {/* Recording Controls */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Recording Controls</h2>
            
            <div className="flex items-center space-x-4 mb-6">
              {!isRecording ? (
                <Button
                  onClick={handleStartRecording}
                  className="bg-red-500 hover:bg-red-600 text-white"
                  size="lg"
                  disabled={isSetupInProgress}
                >
                  <Play className="h-5 w-5 mr-2" />
                  {waitingForRegionSelection ? 'Select Region...' : isSetupInProgress ? 'Starting...' : 'Start Recording'}
                </Button>
              ) : (
                <div className="flex items-center space-x-3">
                  <Button
                    onClick={handlePauseRecording}
                    variant={isPaused ? "default" : "secondary"}
                    size="lg"
                  >
                    <Pause className="h-5 w-5 mr-2" />
                    {isPaused ? 'Resume' : 'Pause'}
                  </Button>
                  <Button
                    onClick={handleStopRecording}
                    variant="destructive"
                    size="lg"
                  >
                    <Square className="h-5 w-5 mr-2" />
                    Stop
                  </Button>
                  <Button
                    onClick={handleChangeRegion}
                    variant="outline"
                    size="lg"
                    disabled={isChangingRegion}
                  >
                    <Monitor className="h-5 w-5 mr-2" />
                    {isChangingRegion ? 'Selecting...' : 'Change Region'}
                  </Button>
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isRecording && !isPaused ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`}></div>
                <span className="text-lg font-mono">
                  {formatTime(recordingTime)}
                </span>
              </div>
            </div>
            
            {/* Save Location */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FolderOpen className="h-5 w-5 text-gray-600" />
                  <div>
                    <div className="text-sm font-medium">Save Location</div>
                    <div className="text-xs text-gray-500 max-w-md truncate" title={saveFolder}>
                      {saveFolder || 'Loading...'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleChooseSaveFolder}
                    title="Choose save folder"
                  >
                    <Folder className="h-4 w-4 mr-1" />
                    Change
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetSaveFolder}
                    title="Reset to default Videos folder"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Device Status */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Device Status</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenSettings}
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <Mic className="h-5 w-5 text-gray-600" />
                <div>
                  <div className="text-sm font-medium">Microphone</div>
                  <div className={`text-xs ${deviceStatus.microphone === 'connected' ? 'text-green-600' : 'text-gray-500'}`}>
                    {deviceStatus.microphone === 'connected' ? 'Ready' : 'Not configured'}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Volume2 className="h-5 w-5 text-gray-600" />
                <div>
                  <div className="text-sm font-medium">System Audio</div>
                  <div className={`text-xs ${deviceStatus.systemAudio === 'connected' ? 'text-green-600' : 'text-gray-500'}`}>
                    {deviceStatus.systemAudio === 'connected' ? 'Ready' : 'Not configured'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Assistant Sidebar */}
      {sidebarOpen && (
        <div className="fixed right-0 top-0 h-full w-80 bg-white border-l border-gray-200 shadow-lg">
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">AI Assistant</h3>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto">
              {assistantMessages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Start recording to get AI assistance</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {assistantMessages.map((message, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-3">
                      <div className="text-sm text-gray-800">{message.content}</div>
                      <div className="text-xs text-gray-500 mt-1">{message.timestamp}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200">
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Ask a question..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button size="sm">Send</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Preferences Modal */}
      <DevicePreferences
        isOpen={devicePreferencesOpen}
        onClose={() => setDevicePreferencesOpen(false)}
        onDeviceSelect={handleDeviceSelect}
      />

      {/* Add error display */}
      {recordingError && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <div className="flex items-center space-x-2">
            <span className="text-sm">{recordingError}</span>
            <button 
              onClick={() => setRecordingError(null)}
              className="text-white hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
