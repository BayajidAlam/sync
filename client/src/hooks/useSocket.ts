// client/src/hooks/useSocket.ts - Updated for Vite
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface VideoStatusEvent {
  videoId: string;
  status: string;
  timestamp: string;
  manifestUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  message?: string;
}

interface ProgressEvent {
  videoId: string;
  progress: number;
  timestamp: string;
}

// Use Vite environment variable
const DEFAULT_SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const useSocket = (serverUrl: string = DEFAULT_SERVER_URL) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [videoStatus, setVideoStatus] = useState<VideoStatusEvent | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  useEffect(() => {
    console.log('🔌 Connecting to Socket.IO server:', serverUrl);
    
    // Initialize socket connection
    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      setIsConnected(true);
      console.log('✅ Connected to Socket.IO server');
      console.log('Socket ID:', socket.id);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('❌ Disconnected from Socket.IO server');
    });

    socket.on('reconnect', (attemptNumber: number) => {
      console.log('🔄 Reconnected after', attemptNumber, 'attempts');
    });

    socket.on('reconnect_error', (error: Error) => {
      console.error('🔴 Reconnection error:', error.message);
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

    // Error handling
    socket.on('error', (error: any) => {
      console.error('Socket error:', error);
    });

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up socket connection');
      socket.disconnect();
    };
  }, [serverUrl]);

  // Join video room for targeted updates
  const joinVideo = (videoId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join-video', videoId);
      console.log(`🎬 Joined video room: ${videoId}`);
    } else {
      console.warn('Cannot join video room - socket not connected');
    }
  };

  // Leave video room
  const leaveVideo = (videoId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('leave-video', videoId);
      console.log(`👋 Left video room: ${videoId}`);
    }
  };

  // Join user room for user-specific updates
  const joinUser = (userId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('join-user', userId);
      console.log(`👤 Joined user room: ${userId}`);
    }
  };

  return {
    isConnected,
    videoStatus,
    progress,
    joinVideo,
    leaveVideo,
    joinUser,
    socket: socketRef.current,
  };
};