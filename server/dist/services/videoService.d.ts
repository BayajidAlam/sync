import { Video, VideoStatus, CreateVideoRequest, UpdateVideoRequest } from '../types/index.js';
export declare class VideoService {
    private mapDocumentToVideo;
    createVideo(videoId: string, request: CreateVideoRequest): Promise<Video>;
    getAllVideos(): Promise<Video[]>;
    getVideoById(id: string): Promise<Video | null>;
    updateVideoStatus(id: string, status: VideoStatus): Promise<Video | null>;
    updateVideo(id: string, updates: UpdateVideoRequest): Promise<Video | null>;
    deleteVideo(id: string): Promise<boolean>;
    markVideoAsUploaded(videoId: string): Promise<Video | null>;
    markVideoAsReady(videoId: string, manifestUrl?: string): Promise<Video | null>;
    searchVideos(query: string): Promise<Video[]>;
    getVideosByStatus(status: VideoStatus): Promise<Video[]>;
    getVideoStats(): Promise<{
        total: number;
        byStatus: Record<VideoStatus, number>;
        totalSize: number;
    }>;
}
export declare const videoService: VideoService;
