// Add this to server/src/routes/webhook.ts (create new file)
import express from "express";
import { videoService } from "../services/videoService.js";
import { VideoStatus } from "../types/index.js";

const router = express.Router();

// Webhook endpoint for ECS completion notification
router.post(
  "/video-processed",
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { videoId, status, manifestUrl, error } = req.body;

      if (!videoId) {
        res.status(400).json({
          error: "Missing videoId in webhook payload",
        });
        return;
      }

      console.log(`📥 Webhook received: Video ${videoId} status: ${status}`);

      if (status === "completed" && manifestUrl) {
        // Mark video as ready for streaming
        const video = await videoService.markVideoAsReady(videoId, manifestUrl);

        if (video) {
          console.log(`✅ Video ${videoId} marked as READY for streaming`);

          // TODO: Send real-time notification to frontend via Socket.IO
          // socketService.emitVideoStatus(videoId, 'READY')

          res.json({
            success: true,
            message: "Video marked as ready",
            data: video,
          });
        } else {
          res.status(404).json({
            error: "Video not found",
          });
        }
      } else if (status === "failed" || error) {
        // Mark video as error
        await videoService.updateVideoStatus(videoId, VideoStatus.ERROR);

        console.log(`❌ Video ${videoId} processing failed: ${error}`);

        res.json({
          success: true,
          message: "Video marked as error",
        });
      } else {
        res.status(400).json({
          error: "Invalid webhook payload",
        });
      }
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({
        error: "Failed to process webhook",
      });
    }
  }
);

// Health check for webhook
router.get("/health", (req: express.Request, res: express.Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

export default router;
