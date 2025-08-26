// server/src/socket/socketService.ts
import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { config } from '../config/env.js';

class SocketService {
  private io: Server | null = null;

  initialize(server: HttpServer): void {
    this.io = new Server(server, {
      cors: {
        origin: config.FRONTEND_URL,
        methods: ['GET', 'POST']
      },
      // OPTIMIZATION: Reduce overhead
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      // COST OPTIMIZATION: Limit connections
      maxHttpBufferSize: 1e6, // 1MB
    });

    this.setupEventHandlers();
    console.log('📡 Socket.IO initialized');
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Join user to their own room for targeted updates
      socket.on('join-user', (userId: string) => {
        socket.join(`user-${userId}`);
        console.log(`👤 User ${userId} joined room`);
      });

      // Join video room for video-specific updates
      socket.on('join-video', (videoId: string) => {
        socket.join(`video-${videoId}`);
        console.log(`🎬 Joined video room: ${videoId}`);
      });

      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
      });
    });
  }

  // Emit video status updates
  emitVideoStatus(videoId: string, status: string, data?: any): void {
    if (!this.io) return;

    const payload = {
      videoId,
      status,
      timestamp: new Date().toISOString(),
      ...data
    };

    // Send to video room and broadcast
    this.io.to(`video-${videoId}`).emit('video-status', payload);
    console.log(`📡 Emitted video-status for ${videoId}: ${status}`);
  }

  // Emit processing progress (throttled)
  emitProgress(videoId: string, progress: number): void {
    if (!this.io) return;

    // OPTIMIZATION: Only emit every 10% progress to reduce overhead
    if (progress % 10 === 0) {
      this.io.to(`video-${videoId}`).emit('processing-progress', {
        videoId,
        progress,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Get connection count (for monitoring)
  getConnectionCount(): number {
    return this.io?.engine.clientsCount || 0;
  }
}

export const socketService = new SocketService();