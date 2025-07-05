import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { 
  Mic, 
  Volume2, 
  CheckCircle, 
  Play,
  Square,
  BarChart3
} from "lucide-react";

export default function DevicePreferences({ isOpen, onClose, onDeviceSelect }) {
  const [devices, setDevices] = useState({
    microphones: [],
    speakers: []
  });
  const [selectedDevices, setSelectedDevices] = useState({
    microphone: null,
    speaker: null
  });
  const [loading, setLoading] = useState(false);
  
  // Separate testing states for each device type
  const [testingMicrophone, setTestingMicrophone] = useState(null);
  const [testingSpeaker, setTestingSpeaker] = useState(null);
  const [testVolume, setTestVolume] = useState(0);
  const [testAudio, setTestAudio] = useState(null);

  // Load devices when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDevices();
      loadSavedSelections();
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllDeviceTests();
    };
  }, []);

  const loadDevices = async () => {
    setLoading(true);
    try {
      // Get media devices from browser API
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      
      setDevices({
        microphones: mediaDevices.filter(device => device.kind === 'audioinput'),
        speakers: mediaDevices.filter(device => device.kind === 'audiooutput')
      });
    } catch (error) {
      console.error('Error loading devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedSelections = async () => {
    try {
      const savedMic = await window.electronAPI.getSetting('selectedDevice.microphone');
      const savedSpeaker = await window.electronAPI.getSetting('selectedDevice.speaker');
      
      setSelectedDevices({
        microphone: savedMic,
        speaker: savedSpeaker
      });
    } catch (error) {
      console.error('Error loading saved selections:', error);
    }
  };

  const handleDeviceSelect = async (deviceId, deviceType) => {
    const newSelections = {
      ...selectedDevices,
      [deviceType]: deviceId
    };
    
    setSelectedDevices(newSelections);
    
    // Save to persistent storage
    await window.electronAPI.selectDevice(deviceId, deviceType);
    
    // Notify parent component (add screen: null since we don't select screens anymore)
    onDeviceSelect({
      ...newSelections,
      screen: null
    });
  };

  const startDeviceTest = async (deviceId, deviceType) => {
    try {
      if (deviceType === 'microphone') {
        // Stop any existing microphone test
        if (testingMicrophone) {
          stopMicrophoneTest();
        }
        
        // Test microphone by showing live volume
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } }
        });
        
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const testState = {
          deviceId,
          stream,
          audioContext,
          analyser,
          dataArray,
          isRunning: true
        };
        
        setTestingMicrophone(testState);
        
        const updateVolume = () => {
          if (testState.isRunning) {
            analyser.getByteFrequencyData(dataArray);
            const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            setTestVolume(Math.round(volume / 2.55)); // Convert to 0-100 scale
            requestAnimationFrame(updateVolume);
          }
        };
        
        updateVolume();
        
      } else if (deviceType === 'speaker') {
        // Stop any existing speaker test
        if (testingSpeaker) {
          stopSpeakerTest();
        }
        
        // Test speaker by playing a test sound
        const testSound = await generateTestSound();
        
        if (testSound && testSound.setSinkId) {
          await testSound.setSinkId(deviceId);
        }
        
        setTestingSpeaker({ deviceId });
        setTestAudio(testSound);
        
        testSound.play();
        
        // Stop testing after sound finishes
        testSound.addEventListener('ended', () => {
          setTestingSpeaker(null);
          setTestAudio(null);
        });
      }
    } catch (error) {
      console.error('Error testing device:', error);
      if (deviceType === 'microphone') {
        setTestingMicrophone(null);
        setTestVolume(0);
      } else {
        setTestingSpeaker(null);
        setTestAudio(null);
      }
    }
  };

  const generateTestSound = async () => {
    try {
      // Create a simple test tone
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // 800 Hz tone
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 1);
      
      // Create MediaStreamDestination to get audio data
      const destination = audioContext.createMediaStreamDestination();
      gainNode.connect(destination);
      
      // Create audio element from stream
      const audio = new Audio();
      audio.srcObject = destination.stream;
      audio.volume = 0.5;
      
      return audio;
    } catch (error) {
      console.error('Error generating test sound:', error);
      return null;
    }
  };

  const stopMicrophoneTest = () => {
    if (testingMicrophone) {
      if (testingMicrophone.isRunning) {
        testingMicrophone.isRunning = false;
      }
      
      if (testingMicrophone.stream) {
        testingMicrophone.stream.getTracks().forEach(track => track.stop());
      }
      
      if (testingMicrophone.audioContext) {
        testingMicrophone.audioContext.close();
      }
    }
    
    setTestingMicrophone(null);
    setTestVolume(0);
  };

  const stopSpeakerTest = () => {
    if (testAudio) {
      testAudio.pause();
      testAudio.currentTime = 0;
    }
    
    setTestingSpeaker(null);
    setTestAudio(null);
  };

  const stopAllDeviceTests = () => {
    stopMicrophoneTest();
    stopSpeakerTest();
  };

  const handleSave = async () => {
    // Stop any ongoing tests
    stopAllDeviceTests();
    // All selections are already saved via handleDeviceSelect
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800">Device Preferences</h2>
          <p className="text-sm text-gray-600 mt-1">Configure your audio devices. Screen region will be selected when you start recording.</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading devices...</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Microphones */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <Mic className="h-5 w-5 mr-2" />
                    Microphones
                  </h3>
                  <div className="space-y-3">
                    {devices.microphones.map((device) => (
                      <div 
                        key={device.deviceId}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedDevices.microphone === device.deviceId
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleDeviceSelect(device.deviceId, 'microphone')}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div className="flex-shrink-0">
                              {selectedDevices.microphone === device.deviceId ? (
                                <CheckCircle className="h-5 w-5 text-blue-500" />
                              ) : (
                                <div className="h-5 w-5 border-2 border-gray-300 rounded-full"></div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{device.label || 'Unknown Microphone'}</div>
                              <div className="text-xs text-gray-500 truncate">ID: {device.deviceId.slice(0, 15)}...</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            {testingMicrophone?.deviceId === device.deviceId && (
                              <div className="flex items-center space-x-2">
                                <BarChart3 className="h-4 w-4 text-green-500" />
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-green-500 h-2 rounded-full transition-all duration-75"
                                    style={{ width: `${testVolume}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-600 w-8">{testVolume}%</span>
                              </div>
                            )}
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (testingMicrophone?.deviceId === device.deviceId) {
                                  stopMicrophoneTest();
                                } else {
                                  startDeviceTest(device.deviceId, 'microphone');
                                }
                              }}
                            >
                              {testingMicrophone?.deviceId === device.deviceId ? (
                                <>
                                  <Square className="h-4 w-4 mr-1" />
                                  Stop
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-1" />
                                  Test
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Speakers */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <Volume2 className="h-5 w-5 mr-2" />
                    Speakers
                  </h3>
                  <div className="space-y-3">
                    {devices.speakers.map((device) => (
                      <div
                        key={device.deviceId}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedDevices.speaker === device.deviceId
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleDeviceSelect(device.deviceId, 'speaker')}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div className="flex-shrink-0">
                              {selectedDevices.speaker === device.deviceId ? (
                                <CheckCircle className="h-5 w-5 text-blue-500" />
                              ) : (
                                <div className="h-5 w-5 border-2 border-gray-300 rounded-full"></div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{device.label || 'Unknown Speaker'}</div>
                              <div className="text-xs text-gray-500 truncate">ID: {device.deviceId.slice(0, 15)}...</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            {testingSpeaker?.deviceId === device.deviceId && (
                              <div className="flex items-center space-x-2">
                                <Volume2 className="h-4 w-4 text-blue-500" />
                                <span className="text-xs text-blue-600">Playing...</span>
                              </div>
                            )}
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (testingSpeaker?.deviceId === device.deviceId) {
                                  stopSpeakerTest();
                                } else {
                                  startDeviceTest(device.deviceId, 'speaker');
                                }
                              }}
                            >
                              {testingSpeaker?.deviceId === device.deviceId ? (
                                <>
                                  <Square className="h-4 w-4 mr-1" />
                                  Stop
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-1" />
                                  Test
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        
                        {/* Help text for speaker testing */}
                        {testingSpeaker?.deviceId === device.deviceId && (
                          <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-800">
                            🔊 You should hear a test tone. If not, try playing a YouTube video to verify your speakers work.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Always visible */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0 bg-gray-50">
          <div className="text-sm text-gray-600">
            {Object.values(selectedDevices).filter(Boolean).length} devices selected
          </div>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 