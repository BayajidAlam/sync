import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config } from '../config/env.js'

export function setupMiddleware(app: express.Application): void {
  // Security headers
  app.use(helmet())

  // CORS
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  }))

  // Body parsing
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // COST OPTIMIZATION: Improved rate limiting (still memory-based, no Redis needed)
  
  // General API rate limiter  
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/', limiter)

  // COST OPTIMIZATION: More restrictive upload rate limiter
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes (was 1 hour)
    max: 5, // 5 uploads per 15 minutes (was 10 per hour) - more restrictive
    message: { error: 'Upload limit exceeded, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/upload/', uploadLimiter)

  // COST OPTIMIZATION: Add streaming rate limiter (new)
  const streamingLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // 200 streaming requests per minute per IP
    message: { error: 'Too many streaming requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/videos/:id/segments', streamingLimiter)
  app.use('/api/videos/:id/manifest', streamingLimiter)

  // Request logging in development
  if (process.env.NODE_ENV === 'development') {
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
      next()
    })
  }
}

// Error handling middleware
export function setupErrorHandling(app: express.Application): void {
  // Health check endpoint
  app.get('/health', (req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      costOptimizations: {
        rateLimitStore: 'memory',
        redisUsage: 'disabled',
        estimatedSavings: '$32/month vs Redis rate limiting',
      },
    })
  })

  // 404 handler
  app.use('*', (req: express.Request, res: express.Response) => {
    res.status(404).json({
      error: 'Route not found',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    })
  })

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err)

    if (res.headersSent) {
      return next(err)
    }

    const statusCode = err.statusCode || 500
    const message = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message || 'Something went wrong'

    res.status(statusCode).json({
      error: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    })
  })
}