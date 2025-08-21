export declare class S3Service {
    generatePresignedUrl(fileName: string, fileType: string): Promise<{
        presignedUrl: string;
        videoId: string;
    }>;
    getVideoUrl(videoId: string, fileName: string): Promise<string>;
    getProcessedVideoUrl(videoId: string, fileName: string): Promise<string>;
    deleteVideo(videoId: string, fileName: string): Promise<void>;
    getManifestUrl(videoId: string): string;
    getSegmentUrl(videoId: string, segment: string): string;
}
export declare const s3Service: S3Service;
