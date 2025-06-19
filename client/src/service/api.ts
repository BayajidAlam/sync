import type { ApiResponse, UploadResponse, Video, VideoStatus } from "../types"

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

class ApiService {
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  // Upload APIs
  async generatePresignedUrl(fileName: string, fileType: string): Promise<UploadResponse> {
    return this.fetch<UploadResponse>('/api/upload/generate-presigned-url', {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType }),
    })
  }

  async uploadToS3(presignedUrl: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100
          onProgress(progress)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          resolve()
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'))
      })

      xhr.open('PUT', presignedUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    })
  }

  // Video APIs
  async getAllVideos(): Promise<ApiResponse<Video[]>> {
    return this.fetch<ApiResponse<Video[]>>('/api/videos')
  }

  async getVideo(id: string): Promise<ApiResponse<Video>> {
    return this.fetch<ApiResponse<Video>>(`/api/videos/${id}`)
  }

  async getVideoStatus(id: string): Promise<ApiResponse<{ status: VideoStatus }>> {
    return this.fetch<ApiResponse<{ status: VideoStatus }>>(`/api/videos/${id}/status`)
  }

  async updateVideo(id: string, data: Partial<Pick<Video, 'title' | 'description'>>): Promise<ApiResponse<Video>> {
    return this.fetch<ApiResponse<Video>>(`/api/videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteVideo(id: string): Promise<ApiResponse<void>> {
    return this.fetch<ApiResponse<void>>(`/api/videos/${id}`, {
      method: 'DELETE',
    })
  }

  // Segment API for video streaming
  getSegmentUrl(videoId: string, segment: string): string {
    return `${API_BASE_URL}/api/videos/${videoId}/segments/${segment}`
  }

  getManifestUrl(videoId: string): string {
    return `${API_BASE_URL}/api/videos/${videoId}/manifest.mpd`
  }
}

export const apiService = new ApiService()