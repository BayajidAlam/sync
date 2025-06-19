import dotenv from 'dotenv'

dotenv.config()

export const config = {
  port: parseInt(process.env.PORT || '5000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  aws: {
    region: process.env.AWS_REGION || 'ap-southeast-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  
  s3: {
    bucketRaw: process.env.S3_BUCKET_RAW!,
    bucketProcessed: process.env.S3_BUCKET_PROCESSED!,
  },
  
  sqs: {
    queueUrl: process.env.SQS_QUEUE_URL!,
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI!,
  },
  
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
}

// Validate required environment variables
const required = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'S3_BUCKET_RAW',
  'S3_BUCKET_PROCESSED',
  'SQS_QUEUE_URL',
  'MONGODB_URI',
]

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}