// server/src/server.ts - Updated to include Socket.IO
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
            console.log(`🔌 Socket.IO: Real-time enabled`);
            console.log(`💾 Database: MongoDB Connected`);
            console.log(`☁️  AWS Region: ${config.AWS_REGION}`);
            console.log(`📁 S3 Raw Bucket: ${config.S3_BUCKET_RAW}`);
            console.log(`📁 S3 Processed Bucket: ${config.S3_BUCKET_PROCESSED}`);
            console.log("✅ Server started successfully");
        });
        // Graceful shutdown
        const shutdown = () => {
            console.log('📴 Shutting down gracefully...');
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        };
        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    }
    catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=server.js.map