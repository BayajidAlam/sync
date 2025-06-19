import { Video, VideoStatus, CreateVideoRequest, UpdateVideoRequest } from '../types/index.js'
import { s3Service } from './s3Service.js'
import { sqsService } from './sqsService.js'
import { config } from '../config/env.js'
import { IVideo, VideoModel } from '../model/video.js'

export class VideoService {
  // Convert MongoDB document to API response format
  private mapDocumentToVideo(doc: IVideo): Video {
    return {
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      filename: doc.filename,
      fileSize: doc.fileSize,
      duration: doc.duration,
      status: doc.status,
      thumbnailUrl: doc.thumbnailUrl,
      videoUrl: doc.videoUrl,
      manifestUrl: doc.manifestUrl,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }
  }

  async createVideo(videoId: string, request: CreateVideoRequest): Promise<Video> {
    try {
      const video = new VideoModel({
        _id: videoId,
        title: request.fileName,
        filename: request.fileName,
        fileSize: request.fileSize,
        status: VideoStatus.UPLOADING,
      })

      const savedVideo = await video.save()
      return this.mapDocumentToVideo(savedVideo)
    } catch (error) {
      console.error('Error creating video:', error)
      throw new Error('Failed to create video record')
    }
  }

  async getAllVideos(): Promise<Video[]> {
    try {
      const videos = await VideoModel.find().sort({ createdAt: -1 })
      return videos.map(video => this.mapDocumentToVideo(video))
    } catch (error) {
      console.error('Error fetching videos:', error)
      throw new Error('Failed to fetch videos')
    }
  }

  async getVideoById(id: string): Promise<Video | null> {
    try {
      const video = await VideoModel.findById(id)
      if (!video) {
        return null
      }
      return this.mapDocumentToVideo(video)
    } catch (error) {
      console.error('Error fetching video:', error)
      throw new Error('Failed to fetch video')
    }
  }

  async updateVideoStatus(id: string, status: VideoStatus): Promise<Video | null> {
    try {
      const video = await VideoModel.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      )
      
      if (!video) {
        return null
      }
      
      return this.mapDocumentToVideo(video)
    } catch (error) {
      console.error('Error updating video status:', error)
      throw new Error('Failed to update video status')
    }
  }

  async updateVideo(id: string, updates: UpdateVideoRequest): Promise<Video | null> {
    try {
      const video = await VideoModel.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true }
      )
      
      if (!video) {
        return null
      }
      
      return this.mapDocumentToVideo(video)
    } catch (error) {
      console.error('Error updating video:', error)
      throw new Error('Failed to update video')
    }
  }

  async deleteVideo(id: string): Promise<boolean> {
    try {
      const video = await VideoModel.findById(id)
      if (!video) {
        return false
      }

      const result = await VideoModel.findByIdAndDelete(id)
      
      if (result) {
        // Delete from S3 (async, don't wait)
        s3Service.deleteVideo(id, video.filename).catch(error => {
          console.error('Error deleting video from S3:', error)
        })
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error deleting video:', error)
      throw new Error('Failed to delete video')
    }
  }

  async markVideoAsUploaded(videoId: string): Promise<Video | null> {
    try {
      const video = await this.getVideoById(videoId)
      if (!video) {
        return null
      }

      // Update status to uploaded
      await this.updateVideoStatus(videoId, VideoStatus.UPLOADED)

      // Send to processing queue
      await sqsService.sendVideoProcessingMessage(
        config.s3.bucketRaw,
        `videos/${videoId}/${video.filename}`,
        videoId
      )

      // Update status to processing
      return this.updateVideoStatus(videoId, VideoStatus.PROCESSING)
    } catch (error) {
      console.error('Error queuing video for processing:', error)
      // Update to error status
      return this.updateVideoStatus(videoId, VideoStatus.ERROR)
    }
  }

  async markVideoAsReady(videoId: string, manifestUrl?: string): Promise<Video | null> {
    try {
      const updates: any = { status: VideoStatus.READY }
      if (manifestUrl) {
        updates.manifestUrl = manifestUrl
      }

      const video = await VideoModel.findByIdAndUpdate(
        videoId,
        { $set: updates },
        { new: true }
      )
      
      if (!video) {
        return null
      }
      
      return this.mapDocumentToVideo(video)
    } catch (error) {
      console.error('Error marking video as ready:', error)
      throw new Error('Failed to mark video as ready')
    }
  }

  // MongoDB-specific search methods
  async searchVideos(query: string): Promise<Video[]> {
    try {
      // Use regex search as fallback if text index is not created
      const videos = await VideoModel.find({
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } }
        ]
      }).sort({ createdAt: -1 })
      
      return videos.map(video => this.mapDocumentToVideo(video))
    } catch (error) {
      console.error('Error searching videos:', error)
      throw new Error('Failed to search videos')
    }
  }

  async getVideosByStatus(status: VideoStatus): Promise<Video[]> {
    try {
      const videos = await VideoModel.find({ status }).sort({ createdAt: -1 })
      return videos.map(video => this.mapDocumentToVideo(video))
    } catch (error) {
      console.error('Error fetching videos by status:', error)
      throw new Error('Failed to fetch videos by status')
    }
  }

  async getVideoStats(): Promise<{
    total: number
    byStatus: Record<VideoStatus, number>
    totalSize: number
  }> {
    try {
      const [total, statusCounts, sizeResult] = await Promise.all([
        VideoModel.countDocuments(),
        VideoModel.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        VideoModel.aggregate([
          { $group: { _id: null, totalSize: { $sum: '$fileSize' } } }
        ])
      ])

      const byStatus = Object.values(VideoStatus).reduce((acc, status) => {
        acc[status] = 0
        return acc
      }, {} as Record<VideoStatus, number>)

      statusCounts.forEach(({ _id, count }) => {
        byStatus[_id as VideoStatus] = count
      })

      return {
        total,
        byStatus,
        totalSize: sizeResult[0]?.totalSize || 0
      }
    } catch (error) {
      console.error('Error getting video stats:', error)
      throw new Error('Failed to get video statistics')
    }
  }
}

export const videoService = new VideoService()