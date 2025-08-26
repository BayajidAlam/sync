import { Video, VideoStatus, CreateVideoRequest, UpdateVideoRequest } from "../types/index.js";
export declare class VideoService {
    private mapDocumentToVideo;
    createVideo(videoId: string, request: CreateVideoRequest): Promise<Video>;
    updateVideoStatus(id: string, status: VideoStatus): Promise<Video | null>;
    markVideoAsUploaded(videoId: string): Promise<Video | null>;
    getAllVideos(): Promise<Video[]>;
    getVideoById(id: string): Promise<Video | null>;
    updateVideo(id: string, updates: UpdateVideoRequest): Promise<Video | null>;
    deleteVideo(id: string): Promise<boolean>;
    markVideoAsReady(videoId: string, manifestPath: string): Promise<Video | null>;
    getSignedStreamingUrl(videoId: string): Promise<string | null>;
    searchVideos(query: string): Promise<Video[]>;
    getVideosByStatus(status: VideoStatus): Promise<Video[]>;
    getVideoStats(): Promise<{
        total: number;
        byStatus: Record<VideoStatus, number>;
        totalSize: number;
    }>;
}
export declare const videoService: VideoService;
