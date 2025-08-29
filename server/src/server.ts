// server/src/server.ts - Updated with proper Socket cleanup
import { createServer } from 'http';
import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { connectDatabase, initializeDatabase } from "./config/database.js";
import { socketService } from "./socket/socketService.js";

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDatabase();
    await initializeDatabase();

    // Create Express app
    const app = createApp();

    // Create HTTP server (required for Socket.IO)
    const server = createServer(app);

    // Initialize Socket.IO
    socketService.initialize(server);

    // Start server
    server.listen(config.PORT, () => {
      console.log(`🚀 VisionSync Server running on port ${config.PORT}`);
      console.log(`📡 Environment: ${config.NODE_ENV}`);
      console.log(`🌐 API URL: http://localhost:${config.PORT}`);
      console.log(`🔌 Socket.IO: Real-time enabled with memory management`);
      console.log(`💾 Database: MongoDB Connected`);
      console.log(`☁️  AWS Region: ${config.AWS_REGION}`);
      console.log(`📁 S3 Raw Bucket: ${config.S3_BUCKET_RAW}`);
      console.log(`📁 S3 Processed Bucket: ${config.S3_BUCKET_PROCESSED}`);
      console.log("✅ Server started successfully");
    });

    // Enhanced graceful shutdown
    const shutdown = async () => {
      console.log('📴 Shutting down gracefully...');
      
      // 1. Stop accepting new connections
      server.close(async (err) => {
        if (err) {
          console.error('Error closing HTTP server:', err);
        }

        try {
          // 2. Shutdown Socket.IO properly
          socketService.shutdown();
          
          // 3. Close database connections
          const mongoose = await import('mongoose');
          await mongoose.connection.close();
          console.log('💾 Database connection closed');

          console.log('✅ Graceful shutdown complete');
          process.exit(0);
        } catch (shutdownError) {
          console.error('❌ Error during shutdown:', shutdownError);
          process.exit(1);
        }
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        console.error('🔴 Force exit after 30s timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    // Handle uncaught errors
    process.on('uncaughtException', (err) => {
      console.error('🔴 Uncaught Exception:', err);
      shutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('🔴 Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown();
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}


startServer();