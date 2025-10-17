import React, { useRef, useEffect, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import toast from 'react-hot-toast';

const CallModal = ({ chat, callType, isIncoming, onClose, caller }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [callStatus, setCallStatus] = useState(isIncoming ? 'incoming' : 'calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callIdRef = useRef(`call_${Date.now()}`);
  const callTimerRef = useRef(null);
  
  const { emit, on } = useSocket();

  // ICE servers configuration (using free STUN servers)
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ]
  };

  // Initialize media devices
  useEffect(() => {
    const initMedia = async () => {
      try {
        const constraints = {
          audio: true,
          video: callType === 'video' ? { width: 1280, height: 720 } : false
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalStream(stream);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // If not incoming call, initiate call
        if (!isIncoming) {
          initiateCall(stream);
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
        toast.error('Failed to access camera/microphone');
        onClose();
      }
    };

    initMedia();

    return () => {
      // Cleanup
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (peerConnection) {
        peerConnection.close();
      }
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, []);

  // Setup WebRTC listeners
  useEffect(() => {
    const unsubscribeOffer = on('webrtc_offer', handleReceiveOffer);
    const unsubscribeAnswer = on('webrtc_answer', handleReceiveAnswer);
    const unsubscribeIce = on('webrtc_ice_candidate', handleReceiveIceCandidate);
    const unsubscribeResponse = on('call_response', handleCallResponse);
    const unsubscribeEnded = on('call_ended', handleCallEnded);

    return () => {
      unsubscribeOffer?.();
      unsubscribeAnswer?.();
      unsubscribeIce?.();
      unsubscribeResponse?.();
      unsubscribeEnded?.();
    };
  }, [on, peerConnection]);

  const createPeerConnection = (stream) => {
    const pc = new RTCPeerConnection(iceServers);

    // Add local stream tracks to peer connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track');
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      setCallStatus('connected');
      startCallTimer();
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const targetUserId = chat.participants.find(p => p._id !== caller?._id)?._id;
        emit('webrtc_ice_candidate', {
          targetUserId,
          candidate: event.candidate,
          callId: callIdRef.current
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    setPeerConnection(pc);
    return pc;
  };

  const initiateCall = async (stream) => {
    console.log('[WebRTC] Initiating call');
    
    const targetUserId = chat.participants.find(p => p._id !== caller._id)?._id;
    
    // Emit call initiation
    emit('call_initiate', {
      chatId: chat._id,
      callType,
      callId: callIdRef.current,
      targetUserId
    });

    const pc = createPeerConnection(stream);
    
    // Create offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      emit('webrtc_offer', {
        targetUserId,
        offer,
        callId: callIdRef.current
      });
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error);
      toast.error('Failed to initiate call');
      endCall();
    }
  };

  const handleReceiveOffer = async ({ offer, from, callId }) => {
    if (callId !== callIdRef.current) return;
    
    console.log('[WebRTC] Received offer');
    
    if (!localStream) return;
    
    const pc = createPeerConnection(localStream);
    
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      emit('webrtc_answer', {
        targetUserId: from,
        answer,
        callId
      });
    } catch (error) {
      console.error('[WebRTC] Error handling offer:', error);
    }
  };

  const handleReceiveAnswer = async ({ answer, from, callId }) => {
    if (callId !== callIdRef.current) return;
    
    console.log('[WebRTC] Received answer');
    
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error('[WebRTC] Error handling answer:', error);
      }
    }
  };

  const handleReceiveIceCandidate = async ({ candidate, from, callId }) => {
    if (callId !== callIdRef.current) return;
    
    if (peerConnection && candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[WebRTC] Error adding ICE candidate:', error);
      }
    }
  };

  const handleCallResponse = ({ accepted, from, callId }) => {
    if (callId !== callIdRef.current) return;
    
    if (accepted) {
      setCallStatus('connecting');
    } else {
      toast.error('Call declined');
      endCall();
    }
  };

  const handleCallEnded = ({ callId }) => {
    if (callId === callIdRef.current) {
      toast('Call ended');
      endCall();
    }
  };

  const acceptCall = () => {
    setCallStatus('connecting');
    const targetUserId = chat.participants.find(p => p._id !== caller._id)?._id;
    emit('call_response', {
      callId: callIdRef.current,
      accepted: true,
      targetUserId
    });
  };

  const declineCall = () => {
    const targetUserId = chat.participants.find(p => p._id !== caller._id)?._id;
    emit('call_response', {
      callId: callIdRef.current,
      accepted: false,
      targetUserId
    });
    endCall();
  };

  const endCall = () => {
    emit('call_end', {
      callId: callIdRef.current,
      chatId: chat._id
    });
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
      peerConnection.close();
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    
    onClose();
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Replace video track in peer connection
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
        
        screenTrack.onended = () => {
          toggleScreenShare();
        };
        
        setIsScreenSharing(true);
      } else {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
        setIsScreenSharing(false);
      }
    } catch (error) {
      console.error('Screen share error:', error);
      toast.error('Failed to share screen');
    }
  };

  const startCallTimer = () => {
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 bg-gray-800 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">{chat.name}</h3>
            <p className="text-sm text-gray-400">
              {callStatus === 'incoming' && 'Incoming call...'}
              {callStatus === 'calling' && 'Calling...'}
              {callStatus === 'connecting' && 'Connecting...'}
              {callStatus === 'connected' && formatDuration(callDuration)}
            </p>
          </div>
          {callType === 'video' ? <VideoIcon className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
        </div>
      </div>

      {/* Video containers */}
      <div className="flex-1 relative bg-black">
        {/* Remote video (main) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />

        {/* Local video (PiP) */}
        {callType === 'video' && !isVideoOff && (
          <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover mirror"
            />
          </div>
        )}

        {/* Waiting state */}
        {!remoteStream && callStatus !== 'incoming' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center text-white">
              <div className="w-24 h-24 mx-auto mb-4 bg-primary-600 rounded-full flex items-center justify-center animate-pulse">
                <Phone className="w-12 h-12" />
              </div>
              <p className="text-lg">{callStatus === 'calling' ? 'Ringing...' : 'Connecting...'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-6 bg-gray-800">
        <div className="flex items-center justify-center space-x-4">
          {callStatus === 'incoming' ? (
            <>
              <button
                onClick={declineCall}
                className="p-4 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={acceptCall}
                className="p-4 bg-green-500 rounded-full hover:bg-green-600 transition-colors"
              >
                <Phone className="w-6 h-6 text-white" />
              </button>
            </>
          ) : (
            <>
              {/* Mute button */}
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition-colors ${
                  isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
              </button>

              {/* Video toggle */}
              {callType === 'video' && (
                <button
                  onClick={toggleVideo}
                  className={`p-4 rounded-full transition-colors ${
                    isVideoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {isVideoOff ? <VideoOff className="w-6 h-6 text-white" /> : <VideoIcon className="w-6 h-6 text-white" />}
                </button>
              )}

              {/* Screen share */}
              {callType === 'video' && (
                <button
                  onClick={toggleScreenShare}
                  className={`p-4 rounded-full transition-colors ${
                    isScreenSharing ? 'bg-primary-500 hover:bg-primary-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {isScreenSharing ? <MonitorOff className="w-6 h-6 text-white" /> : <Monitor className="w-6 h-6 text-white" />}
                </button>
              )}

              {/* End call */}
              <button
                onClick={endCall}
                className="p-4 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .mirror {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  );
};

export default CallModal;
