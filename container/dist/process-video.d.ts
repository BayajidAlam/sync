export declare class VideoProcessor {
    private s3Client;
    private env;
    private tempDir;
    constructor();
    private validateEnvironment;
    private downloadVideo;
    private sendWebhook;
    private parseFFmpegProgress;
    private processVideoWithFFmpeg;
    private uploadProcessedFiles;
    private cleanup;
    process(): Promise<void>;
}
