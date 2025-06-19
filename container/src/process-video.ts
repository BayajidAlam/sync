import { S3 } from 'aws-sdk';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import axios from 'axios';

interface ProcessingEnvironment {
  videoId: string;
  videoBucket: string;
  videoFileName: string;
  outputBucket: string;
  webhookUrl?: string;
  awsRegion: string;
}

interface WebhookPayload {
  videoId: string;
  status: 'ready' | 'error';
  timestamp: string;
  manifestUrl?: string;
  error?: string;
}

interface FFmpegProgress {
  frame?: number;
  fps?: number;
  time?: string;
  bitrate?: string;
  size?: string;
}

class VideoProcessor {
  private s3: S3;
  private tempDir: string = '/tmp/video-processing';
  private env: ProcessingEnvironment;

  constructor() {
    this.s3 = new S3({
      region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-1'
    });
    
    this.env = this.validateAndParseEnvironment();
  }

  private validateAndParseEnvironment(): ProcessingEnvironment {
    const required = ['VIDEO_ID', 'VIDEO_BUCKET', 'VIDEO_FILE_NAME', 'OUTPUT_BUCKET'];
    const missing = required.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    const env: ProcessingEnvironment = {
      videoId: process.env.VIDEO_ID!,
      videoBucket: process.env.VIDEO_BUCKET!,
      videoFileName: process.env.VIDEO_FILE_NAME!,
      outputBucket: process.env.OUTPUT_BUCKET!,
      webhookUrl: process.env.WEBHOOK_URL,
      awsRegion: process.env.AWS_DEFAULT_REGION || 'ap-southeast-1'
    };
    
    console.log('Environment validated:', {
      videoId: env.videoId,
      videoBucket: env.videoBucket,
      videoFileName: env.videoFileName,
      outputBucket: env.outputBucket,
      webhookUrl: env.webhookUrl ? 'configured' : 'not configured',
      awsRegion: env.awsRegion
    });
    
    return env;
  }

  private async downloadVideo(outputPath: string): Promise<number> {
    console.log(`Downloading video from s3://${this.env.videoBucket}/${this.env.videoFileName}...`);
    
    try {
      const videoObject = await this.s3.getObject({ 
        Bucket: this.env.videoBucket, 
        Key: this.env.videoFileName 
      }).promise();
      
      if (!videoObject.Body) {
        throw new Error('Video object body is empty');
      }
      
      await fs.writeFile(outputPath, videoObject.Body as Buffer);
      
      const stats = await fs.stat(outputPath);
      console.log(`Video downloaded successfully: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      
      return stats.size;
    } catch (error) {
      console.error('Error downloading video:', error);
      throw new Error(`Failed to download video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseFFmpegProgress(line: string): FFmpegProgress | null {
    const progress: FFmpegProgress = {};
    
    // Parse frame=1234 fps=30.5 q=28.0 size=1024kB time=00:01:23.45 bitrate=1234.5kbits/s
    const frameMatch = line.match(/frame=\s*(\d+)/);
    const fpsMatch = line.match(/fps=\s*([\d.]+)/);
    const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
    const bitrateMatch = line.match(/bitrate=\s*([\d.]+\w+)/);
    const sizeMatch = line.match(/size=\s*(\d+\w+)/);
    
    if (frameMatch) progress.frame = parseInt(frameMatch[1]);
    if (fpsMatch) progress.fps = parseFloat(fpsMatch[1]);
    if (timeMatch) progress.time = timeMatch[1];
    if (bitrateMatch) progress.bitrate = bitrateMatch[1];
    if (sizeMatch) progress.size = sizeMatch[1];
    
    return Object.keys(progress).length > 0 ? progress : null;
  }

  private async processVideoWithFFmpeg(inputPath: string, outputDir: string): Promise<void> {
    console.log('Starting FFmpeg processing...');
    
    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', inputPath,
        '-filter_complex',
        '[0:v]split=4[v1][v2][v3][v4]; [v1]scale=1920:1080[v1out]; [v2]scale=1280:720[v2out]; [v3]scale=854:480[v3out]; [v4]scale=640:360[v4out]',
        
        // Video streams with different quality levels
        '-map', '[v1out]', '-c:v:0', 'libx264', '-b:v:0', '5000k', '-maxrate:0', '5500k', '-bufsize:0', '10000k',
        '-map', '[v2out]', '-c:v:1', 'libx264', '-b:v:1', '3000k', '-maxrate:1', '3300k', '-bufsize:1', '6000k',
        '-map', '[v3out]', '-c:v:2', 'libx264', '-b:v:2', '1500k', '-maxrate:2', '1650k', '-bufsize:2', '3000k',
        '-map', '[v4out]', '-c:v:3', 'libx264', '-b:v:3', '800k', '-maxrate:3', '880k', '-bufsize:3', '1600k',

        // Audio stream
        '-map', '0:a?', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
        
        // Encoding settings
        '-g', '48', '-sc_threshold', '0', '-keyint_min', '48', 
        '-preset', 'fast', '-profile:v', 'high', '-level', '4.0',
        
        // DASH settings
        '-adaptation_sets', 'id=0,streams=v id=1,streams=a',
        '-f', 'dash',
        '-seg_duration', '4',
        '-frag_duration', '4',
        '-min_seg_duration', '4',
        '-use_template', '1',
        '-use_timeline', '1',
        '-init_seg_name', 'init-$RepresentationID$.m4s',
        '-media_seg_name', 'chunk-$RepresentationID$-$Number$.m4s',
        
        // Output manifest
        path.join(outputDir, 'manifest.mpd')
      ];

      console.log('FFmpeg command:', ['ffmpeg', ...ffmpegArgs].join(' '));

      const ffmpeg: ChildProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let lastProgressTime = 0;
      const progressInterval = 5000; // Log progress every 5 seconds

      ffmpeg.stdout?.on('data', (data: Buffer) => {
        // FFmpeg writes progress to stderr, not stdout
      });

      ffmpeg.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        
        // Parse and log progress
        const progress = this.parseFFmpegProgress(output);
        if (progress && Date.now() - lastProgressTime > progressInterval) {
          console.log(`FFmpeg progress:`, progress);
          lastProgressTime = Date.now();
        }
        
        // Log errors and warnings
        if (output.includes('Error') || output.includes('error')) {
          console.error(`FFmpeg error: ${output.trim()}`);
        }
      });
      
      ffmpeg.on('error', (error: Error) => {
        console.error('FFmpeg spawn error:', error);
        reject(new Error(`FFmpeg spawn failed: ${error.message}`));
      });
      
      ffmpeg.on('close', (code: number | null) => {
        if (code === 0) {
          console.log('FFmpeg processing completed successfully');
          resolve();
        } else {
          console.error('FFmpeg failed with code:', code);
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });
  }

  private async uploadProcessedFiles(outputDir: string): Promise<S3.ManagedUpload.SendData[]> {
    console.log('Uploading processed files to S3...');
    
    try {
      const files = await fs.readdir(outputDir);
      console.log(`Found ${files.length} files to upload:`, files);
      
      const uploadPromises = files.map(async (file): Promise<S3.ManagedUpload.SendData> => {
        const filePath = path.join(outputDir, file);
        const fileContent = await fs.readFile(filePath);
        
        // Determine content type
        const contentType = file.endsWith('.mpd') ? 'application/dash+xml' : 
                           file.endsWith('.m4s') ? 'video/iso.segment' : 
                           'application/octet-stream';
        
        const uploadParams: S3.PutObjectRequest = {
          Bucket: this.env.outputBucket,
          Key: `${this.env.videoId}/${file}`,
          Body: fileContent,
          ContentType: contentType,
          CacheControl: 'max-age=31536000', // 1 year cache for segments
          Metadata: {
            'video-id': this.env.videoId,
            'processed-at': new Date().toISOString()
          }
        };
        
        console.log(`Uploading ${file} (${(fileContent.length / 1024).toFixed(2)} KB)...`);
        
        const result = await this.s3.upload(uploadParams).promise();
        console.log(`Successfully uploaded: ${result.Key}`);
        return result;
      });

      const results = await Promise.all(uploadPromises);
      console.log(`Successfully uploaded ${results.length} files to S3`);
      
      return results;
    } catch (error) {
      console.error('Error uploading files:', error);
      throw new Error(`Failed to upload processed files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async sendWebhook(status: 'ready' | 'error', manifestUrl?: string, error?: string): Promise<void> {
    if (!this.env.webhookUrl) {
      console.log('No webhook URL configured, skipping webhook');
      return;
    }
    
    const payload: WebhookPayload = {
      videoId: this.env.videoId,
      status,
      timestamp: new Date().toISOString()
    };
    
    if (manifestUrl) {
      payload.manifestUrl = manifestUrl;
    }
    
    if (error) {
      payload.error = error;
    }
    
    try {
      console.log('Sending webhook:', payload);
      
      const response = await axios.post(this.env.webhookUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VisionSync-VideoProcessor/1.0'
        }
      });
      
      console.log(`Webhook sent successfully: ${response.status} ${response.statusText}`);
    } catch (webhookError) {
      console.error('Failed to send webhook:', {
        error: webhookError instanceof Error ? webhookError.message : 'Unknown error',
        status: axios.isAxiosError(webhookError) ? webhookError.response?.status : undefined,
        data: axios.isAxiosError(webhookError) ? webhookError.response?.data : undefined
      });
      // Don't throw here - webhook failure shouldn't fail the entire process
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      console.log('Cleanup completed');
    } catch (error) {
      console.error('Cleanup failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  public async process(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log('='.repeat(50));
      console.log('Starting video processing');
      console.log('='.repeat(50));
      
      // Ensure temporary directories exist
      await fs.mkdir(this.tempDir, { recursive: true });
      const inputPath = path.join(this.tempDir, 'input.mp4');
      const outputPath = path.join(this.tempDir, 'output');
      await fs.mkdir(outputPath, { recursive: true });

      // Download video from S3
      const videoSize = await this.downloadVideo(inputPath);

      // Process video with FFmpeg
      await this.processVideoWithFFmpeg(inputPath, outputPath);

      // Upload processed files
      await this.uploadProcessedFiles(outputPath);

      // Send success webhook
      const manifestUrl = `${this.env.videoId}/manifest.mpd`;
      await this.sendWebhook('ready', manifestUrl);

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('='.repeat(50));
      console.log(`Video processing completed successfully in ${processingTime}s`);
      console.log(`Video size: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Video ID: ${this.env.videoId}`);
      console.log(`Manifest URL: ${manifestUrl}`);
      console.log('='.repeat(50));

    } catch (error) {
      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error('='.repeat(50));
      console.error(`Video processing failed after ${processingTime}s`);
      console.error('Error:', errorMessage);
      console.error('='.repeat(50));
      
      // Send error webhook
      await this.sendWebhook('error', undefined, errorMessage);
      
      throw error;
    } finally {
      // Always cleanup
      await this.cleanup();
    }
  }
}

// Handle process signals for graceful shutdown
const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}, performing cleanup...`);
  try {
    await fs.rm('/tmp/video-processing', { recursive: true, force: true });
  } catch (error) {
    console.error('Cleanup error:', error);
  }
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Main execution
const main = async (): Promise<void> => {
  try {
    console.log('VisionSync Video Processor starting...');
    const processor = new VideoProcessor();
    await processor.process();
    console.log('Video processing completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Video processing failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
};

main();