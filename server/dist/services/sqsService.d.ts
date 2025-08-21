export declare class SQSService {
    sendVideoProcessingMessage(bucketName: string, fileName: string, videoId: string): Promise<void>;
}
export declare const sqsService: SQSService;
