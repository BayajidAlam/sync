import express from 'express';
import { videoService } from '../services/videoService.js';
import { VideoStatus } from '../types/index.js';
const router = express.Router();
// Webhook for video processing completion
router.post('/processing-complete', async (req, res) => {
    try {
        const { videoId, status, manifestUrl } = req.body;
        if (!videoId || !status) {
            res.status(400).json({
                error: 'Missing required fields: videoId, status',
            });
            return;
        }
        // Validate status is a valid VideoStatus
        if (!Object.values(VideoStatus).includes(status)) {
            res.status(400).json({
                error: 'Invalid status value',
            });
            return;
        }
        // Update video status in database
        let updatedVideo;
        if (status === VideoStatus.READY && manifestUrl) {
            updatedVideo = await videoService.markVideoAsReady(videoId, manifestUrl);
        }
        else if (status === VideoStatus.ERROR) {
            updatedVideo = await videoService.updateVideoStatus(videoId, VideoStatus.ERROR);
        }
        else {
            updatedVideo = await videoService.updateVideoStatus(videoId, status);
        }
        if (!updatedVideo) {
            res.status(404).json({
                error: 'Video not found',
            });
            return;
        }
        res.json({
            data: updatedVideo,
            message: 'Video status updated successfully',
        });
    }
    catch (error) {
        console.error('Processing webhook error:', error);
        res.status(500).json({
            error: 'Failed to update video status',
        });
    }
});
// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'vision-sync-server',
    });
});
export default router;
//# sourceMappingURL=webhook.js.map