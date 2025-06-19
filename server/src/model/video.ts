import mongoose, { Schema, Document } from 'mongoose'
import { VideoStatus } from '../types/index.js'

export interface IVideo extends Document {
  _id: string
  title: string
  description?: string
  filename: string
  fileSize: number
  duration?: number
  status: VideoStatus
  thumbnailUrl?: string
  videoUrl?: string
  manifestUrl?: string
  createdAt: Date
  updatedAt: Date
}

const VideoSchema = new Schema<IVideo>({
  title: {
    type: String,
    required: true,
    maxlength: 255,
  },
  description: {
    type: String,
    maxlength: 1000,
  },
  filename: {
    type: String,
    required: true,
    maxlength: 255,
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0,
  },
  duration: {
    type: Number,
    min: 0,
  },
  status: {
    type: String,
    enum: Object.values(VideoStatus),
    default: VideoStatus.UPLOADING,
    required: true,
  },
  thumbnailUrl: {
    type: String,
  },
  videoUrl: {
    type: String,
  },
  manifestUrl: {
    type: String,
  },
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id
      delete ret._id
      delete ret.__v
      return ret
    }
  }
})

// Create indexes for better query performance
VideoSchema.index({ status: 1 })
VideoSchema.index({ createdAt: -1 })
VideoSchema.index({ title: 'text', description: 'text' }) // Text search index

export const VideoModel = mongoose.model<IVideo>('Video', VideoSchema)