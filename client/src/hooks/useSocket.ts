// client/src/hooks/useSocket.ts
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface VideoStatusEvent {
  videoId: string;
  status: string;
  timestamp: string;
  manifestUrl?: string;
  error?: string;
  message?: string;
}

interface ProgressEvent {
  videoId: string;
  progress: number;
  timestamp: string;
}

export const useSocket = (serverUrl: string = 'http://localhost:5000') => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [videoStatus, setVideoStatus] = useState<VideoStatusEvent | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      setIsConnected(true);
      console.log('🔌 Connected to server');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('🔌 Disconnected from server');
    });

    // Video status updates
    socket.on('video-status', (data: VideoStatusEvent) => {
      console.log('📡 Received video status:', data);
      setVideoStatus(data);
    });

    // Processing progress updates
    socket.on('processing-progress', (data: ProgressEvent) => {
      console.log('📊 Received progress:', data);
      setProgress(data);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, [serverUrl]);

  // Join video room for targeted updates
  const joinVideo = (videoId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('join-video', videoId);
      console.log(`🎬 Joined video room: ${videoId}`);
    }
  };

  // Leave video room
  const leaveVideo = (videoId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('leave-video', videoId);
    }
  };

  return {
    isConnected,
    videoStatus,
    progress,
    joinVideo,
    leaveVideo,
  };
};