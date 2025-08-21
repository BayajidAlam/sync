import express from 'express';
import { setupMiddleware, setupErrorHandling } from './middleware/index.js';
import uploadRoutes from './routes/upload.js';
import videoRoutes from './routes/video.js';
import webhookRoutes from './routes/webhook.js';
export function createApp() {
    const app = express();
    // Setup middleware
    setupMiddleware(app);
    // API routes
    app.use('/api/upload', uploadRoutes);
    app.use('/api/videos', videoRoutes);
    app.use('/api/webhook', webhookRoutes);
    // Root endpoint
    app.get('/', (req, res) => {
        res.json({
            message: 'VisionSync API Server',
            version: '1.0.0',
            status: 'running',
            endpoints: {
                upload: '/api/upload',
                videos: '/api/videos',
                webhook: '/api/webhook',
                health: '/api/webhook/health',
            },
        });
    });
    // Setup error handling
    setupErrorHandling(app);
    return app;
}
//# sourceMappingURL=app.js.map