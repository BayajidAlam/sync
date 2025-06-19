import mongoose from 'mongoose'
import { config } from './env.js'

// Connect to MongoDB
export async function connectDatabase() {
  try {
    await mongoose.connect(config.mongodb.uri)
    console.log('✅ MongoDB connected successfully')
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error)
    process.exit(1)
  }
}

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
  console.log('📦 Mongoose connected to MongoDB')
})

mongoose.connection.on('error', (error) => {
  console.error('❌ Mongoose connection error:', error)
})

mongoose.connection.on('disconnected', () => {
  console.log('📤 Mongoose disconnected from MongoDB')
})

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close()
  console.log('📴 MongoDB connection closed through app termination')
  process.exit(0)
})

export async function initializeDatabase() {
  // MongoDB doesn't need explicit table creation like PostgreSQL
  // Mongoose will create collections automatically when first document is inserted
  console.log('✅ MongoDB initialized (collections will be created automatically)')
}