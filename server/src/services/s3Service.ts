import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '../config/aws.js'
import { config } from '../config/env.js'
import { v4 as uuidv4 } from 'uuid'

export class S3Service {
  async generatePresignedUrl(fileName: string, fileType: string): Promise<{ presignedUrl: string; videoId: string }> {
    const videoId = uuidv4()
    const key = `videos/${videoId}/${fileName}`

    const command = new PutObjectCommand({
      Bucket: config.s3.bucketRaw,
      Key: key,
      ContentType: fileType,
    })

    try {
      const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600, // 1 hour
      })

      return { presignedUrl, videoId }
    } catch (error) {
      console.error('Error generating presigned URL:', error)
      throw new Error('Failed to generate presigned URL')
    }
  }

  async getVideoUrl(videoId: string, fileName: string): Promise<string> {
    const key = `videos/${videoId}/${fileName}`
    
    const command = new GetObjectCommand({
      Bucket: config.s3.bucketRaw,
      Key: key,
    })

    try {
      return await getSignedUrl(s3Client, command, {
        expiresIn: 3600, // 1 hour
      })
    } catch (error) {
      console.error('Error getting video URL:', error)
      throw new Error('Failed to get video URL')
    }
  }

  async getProcessedVideoUrl(videoId: string, fileName: string): Promise<string> {
    const key = `${videoId}/${fileName}`
    
    const command = new GetObjectCommand({
      Bucket: config.s3.bucketProcessed,
      Key: key,
    })

    try {
      return await getSignedUrl(s3Client, command, {
        expiresIn: 3600, // 1 hour
      })
    } catch (error) {
      console.error('Error getting processed video URL:', error)
      throw new Error('Failed to get processed video URL')
    }
  }

  async deleteVideo(videoId: string, fileName: string): Promise<void> {
    const key = `videos/${videoId}/${fileName}`
    
    const command = new DeleteObjectCommand({
      Bucket: config.s3.bucketRaw,
      Key: key,
    })

    try {
      await s3Client.send(command)
    } catch (error) {
      console.error('Error deleting video from S3:', error)
      throw new Error('Failed to delete video from S3')
    }
  }

  getManifestUrl(videoId: string): string {
    return `https://${config.s3.bucketProcessed}.s3.${config.aws.region}.amazonaws.com/${videoId}/manifest.mpd`
  }

  getSegmentUrl(videoId: string, segment: string): string {
    return `https://${config.s3.bucketProcessed}.s3.${config.aws.region}.amazonaws.com/${videoId}/${segment}`
  }
}

export const s3Service = new S3Service()