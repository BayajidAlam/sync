import { createApp } from './app.js'
import { config } from './config/env.js'
import { connectDatabase, initializeDatabase } from './config/database.js'

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDatabase()
    
    // Initialize database (MongoDB doesn't need explicit table creation)
    await initializeDatabase()

    // Create Express app
    const app = createApp()

    // Start server
    app.listen(config.port, () => {
      console.log(`🚀 VisionSync Server running on port ${config.port}`)
      console.log(`📡 Environment: ${config.nodeEnv}`)
      console.log(`🌐 API URL: http://localhost:${config.port}`)
      console.log(`💾 Database: MongoDB Connected`)
      console.log(`☁️  AWS Region: ${config.aws.region}`)
      console.log(`📁 S3 Raw Bucket: ${config.s3.bucketRaw}`)
      console.log(`📁 S3 Processed Bucket: ${config.s3.bucketProcessed}`)
      console.log('✅ Server started successfully')
    })
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully')
  process.exit(0)
})

// Start the server
startServer()