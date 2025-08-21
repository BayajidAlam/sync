// client/src/service/api.ts - Complete API service with missing methods

import type { ApiResponse, UploadResponse, Video, VideoStatus } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

class ApiService {
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API Error: ${response.status} ${response.statusText}`;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Use default error message if response isn't JSON
      }

      throw new Error(errorMessage);
    }

    return response.json();
  }

  async generatePresignedUrl(
    fileName: string,
    fileType: string,
    fileSize?: number 
  ): Promise<UploadResponse> {
    const response = await this.fetch<{ data: UploadResponse }>(
      "/api/upload/generate-presigned-url",
      {
        method: "POST",
        body: JSON.stringify({
          fileName,
          fileType,
          fileSize, 
        }),
      }
    );

    return response.data;
  }

  // 🔥 NEW: Upload confirmation (MISSING PIECE!)
  async confirmUpload(videoId: string): Promise<ApiResponse<Video>> {
    return this.fetch<ApiResponse<Video>>(`/api/upload/confirm/${videoId}`, {
      method: "POST",
    });
  }

  async uploadToS3(
    presignedUrl: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          resolve();
        } else {
          reject(new Error(`S3 Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("S3 Upload failed: Network error"));
      });

      xhr.addEventListener("timeout", () => {
        reject(new Error("S3 Upload failed: Timeout"));
      });

      xhr.open("PUT", presignedUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.timeout = 300000; // 5 minutes timeout
      xhr.send(file);
    });
  }

  // 🔥 VIDEO APIS (Enhanced)
  async getAllVideos(): Promise<ApiResponse<Video[]>> {
    return this.fetch<ApiResponse<Video[]>>("/api/videos");
  }

  async getVideo(id: string): Promise<ApiResponse<Video>> {
    return this.fetch<ApiResponse<Video>>(`/api/videos/${id}`);
  }

  async getVideoStatus(
    id: string
  ): Promise<ApiResponse<{ status: VideoStatus }>> {
    return this.fetch<ApiResponse<{ status: VideoStatus }>>(
      `/api/videos/${id}/status`
    );
  }

  // 🔥 NEW: Search videos
  async searchVideos(query: string): Promise<ApiResponse<Video[]>> {
    return this.fetch<ApiResponse<Video[]>>(
      `/api/videos/search?q=${encodeURIComponent(query)}`
    );
  }

  // 🔥 NEW: Get video statistics
  async getVideoStats(): Promise<ApiResponse<any>> {
    return this.fetch<ApiResponse<any>>("/api/videos/stats/overview");
  }

  // 🔥 NEW: Get videos by status
  async getVideosByStatus(status: VideoStatus): Promise<ApiResponse<Video[]>> {
    return this.fetch<ApiResponse<Video[]>>(`/api/videos/status/${status}`);
  }

  async updateVideo(
    id: string,
    data: Partial<Pick<Video, "title" | "description">>
  ): Promise<ApiResponse<Video>> {
    return this.fetch<ApiResponse<Video>>(`/api/videos/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteVideo(id: string): Promise<ApiResponse<void>> {
    return this.fetch<ApiResponse<void>>(`/api/videos/${id}`, {
      method: "DELETE",
    });
  }

  // 🔥 STREAMING APIS (Enhanced)
  getSegmentUrl(videoId: string, segment: string): string {
    return `${API_BASE_URL}/api/videos/${videoId}/segments/${segment}`;
  }

  getManifestUrl(videoId: string): string {
    return `${API_BASE_URL}/api/videos/${videoId}/manifest.mpd`;
  }

  // 🔥 NEW: Health check
  async checkHealth(): Promise<any> {
    return this.fetch<any>("/health");
  }

  // 🔥 NEW: Webhook health
  async checkWebhookHealth(): Promise<any> {
    return this.fetch<any>("/api/webhook/health");
  }

  // 🔥 UTILITY METHODS
  getApiBaseUrl(): string {
    return API_BASE_URL;
  }

  // Test API connectivity
  async testConnection(): Promise<boolean> {
    try {
      await this.checkHealth();
      return true;
    } catch {
      return false;
    }
  }
}

export const apiService = new ApiService();

// Export for testing
export { ApiService };
