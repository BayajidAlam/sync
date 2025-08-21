import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { connectDatabase, initializeDatabase } from "./config/database.js";
async function startServer() {
    try {
        // Connect to MongoDB
        await connectDatabase();
        // Initialize database (MongoDB doesn't need explicit table creation)
        await initializeDatabase();
        // Create Express app
        const app = createApp();
        // Start server
        app.listen(config.PORT, () => {
            console.log(`🚀 VisionSync Server running on port ${config.PORT}`);
            console.log(`📡 Environment: ${config.NODE_ENV}`);
            console.log(`🌐 API URL: http://localhost:${config.PORT}`);
            console.log(`💾 Database: MongoDB Connected`);
            console.log(`☁️  AWS Region: ${config.AWS_REGION}`);
            console.log(`📁 S3 Raw Bucket: ${config.S3_BUCKET_RAW}`);
            console.log(`📁 S3 Processed Bucket: ${config.S3_BUCKET_PROCESSED}`);
            console.log("✅ Server started successfully");
        });
    }
    catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
}
// Handle graceful shutdown
process.on("SIGTERM", () => {
    console.log("📴 Received SIGTERM, shutting down gracefully");
    process.exit(0);
});
process.on("SIGINT", () => {
    console.log("📴 Received SIGINT, shutting down gracefully");
    process.exit(0);
});
// Start the server
startServer();
//# sourceMappingURL=server.js.map