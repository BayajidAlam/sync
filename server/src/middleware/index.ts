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
    origin: config.cors.origin,
    credentials: true,
  }))

  // Body parsing
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/', limiter)

  // Specific rate limit for uploads
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 uploads per hour
    message: { error: 'Upload limit exceeded, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/upload/', uploadLimiter)

  // Request logging in development
  if (config.nodeEnv === 'development') {
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
      next()
    })
  }
}

// Error handling middleware
export function setupErrorHandling(app: express.Application): void {
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
    const message = config.nodeEnv === 'production' 
      ? 'Internal server error' 
      : err.message || 'Something went wrong'

    res.status(statusCode).json({
      error: message,
      ...(config.nodeEnv === 'development' && { stack: err.stack }),
    })
  })
}