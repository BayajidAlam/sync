// server/src/routes/webhook.ts - Updated with Socket.IO
import express from 'express';
import { videoService } from '../services/videoService.js';
import { socketService } from '../socket/socketService.js';
import { VideoStatus } from '../types/index.js';
const router = express.Router();
// Webhook for video processing completion
router.post('/processing-complete', async (req, res) => {
    try {
        const { videoId, status, manifestUrl, error } = req.body;
        if (!videoId || !status) {
            res.status(400).json({
                error: 'Missing required fields: videoId, status',
            });
            return;
        }
        console.log(`📥 Webhook received: Video ${videoId} status: ${status}`);
        // Update database
        let updatedVideo;
        if (status === 'ready' && manifestUrl) {
            updatedVideo = await videoService.markVideoAsReady(videoId, manifestUrl);
            // ✅ EMIT REAL-TIME UPDATE
            socketService.emitVideoStatus(videoId, 'READY', {
                manifestUrl,
                message: 'Video processing complete! Ready for streaming.'
            });
        }
        else if (status === 'error' || error) {
            updatedVideo = await videoService.updateVideoStatus(videoId, VideoStatus.ERROR);
            // ❌ EMIT ERROR UPDATE  
            socketService.emitVideoStatus(videoId, 'ERROR', {
                error: error || 'Processing failed',
                message: 'Video processing failed. Please try uploading again.'
            });
        }
        else {
            updatedVideo = await videoService.updateVideoStatus(videoId, status.toUpperCase());
            // 🔄 EMIT PROCESSING UPDATE
            socketService.emitVideoStatus(videoId, status.toUpperCase(), {
                message: `Video is ${status}`
            });
        }
        if (!updatedVideo) {
            res.status(404).json({ error: 'Video not found' });
            return;
        }
        console.log(`✅ Video ${videoId} updated and broadcasted`);
        res.json({
            data: updatedVideo,
            message: 'Video status updated and broadcasted',
        });
    }
    catch (error) {
        console.error('Processing webhook error:', error);
        res.status(500).json({ error: 'Failed to update video status' });
    }
});
// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'vision-sync-server',
        connections: socketService.getConnectionCount()
    });
});
export default router;
//# sourceMappingURL=webhook.js.map