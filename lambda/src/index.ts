import { SQSEvent, SQSRecord, Context, SQSHandler, SQSBatchResponse } from 'aws-lambda';
import { ECS } from 'aws-sdk';

interface VideoProcessingMessage {
  bucketName: string;
  fileName: string;
  videoId: string;
  timestamp?: string;
}

interface ProcessingResult {
  messageId: string;
  videoId?: string;
  taskArn?: string;
  status: 'started' | 'failed';
  error?: string;
}

const ecs = new ECS();

const validateEnvironment = (): void => {
  const required = ['ECS_CLUSTER', 'ECS_TASK_DEFINITION', 'SUBNET_IDS', 'SECURITY_GROUP_ID', 'PROCESSED_BUCKET'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

const parseMessage = (record: SQSRecord): VideoProcessingMessage => {
  try {
    const message = JSON.parse(record.body) as VideoProcessingMessage;
    
    if (!message.bucketName || !message.fileName || !message.videoId) {
      throw new Error('Missing required fields: bucketName, fileName, or videoId');
    }
    
    return message;
  } catch (error) {
    throw new Error(`Failed to parse SQS message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

const startECSTask = async (message: VideoProcessingMessage): Promise<string> => {
  const taskParams: ECS.RunTaskRequest = {
    cluster: process.env.ECS_CLUSTER!,
    taskDefinition: process.env.ECS_TASK_DEFINITION!,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: process.env.SUBNET_IDS!.split(','),
        securityGroups: [process.env.SECURITY_GROUP_ID!],
        assignPublicIp: 'ENABLED',
      },
    },
    overrides: {
      containerOverrides: [{
        name: 'video-processor',
        environment: [
          { name: 'VIDEO_BUCKET', value: message.bucketName },
          { name: 'VIDEO_FILE_NAME', value: message.fileName },
          { name: 'VIDEO_ID', value: message.videoId },
          { name: 'OUTPUT_BUCKET', value: process.env.PROCESSED_BUCKET! },
          { name: 'WEBHOOK_URL', value: process.env.WEBHOOK_URL || '' },
          { name: 'AWS_DEFAULT_REGION', value: process.env.AWS_REGION || 'ap-southeast-1' },
        ],
      }],
    },
    tags: [
      { key: 'VideoId', value: message.videoId },
      { key: 'Purpose', value: 'VideoProcessing' },
      { key: 'Timestamp', value: new Date().toISOString() }
    ]
  };
  
  console.log('Starting ECS task:', {
    cluster: taskParams.cluster,
    taskDefinition: taskParams.taskDefinition,
    videoId: message.videoId
  });
  
  const result = await ecs.runTask(taskParams).promise();
  
  if (result.failures && result.failures.length > 0) {
    const failure = result.failures[0];
    throw new Error(`ECS task failed: ${failure.reason} - ${failure.detail || ''}`);
  }
  
  if (!result.tasks || result.tasks.length === 0) {
    throw new Error('No ECS tasks were started');
  }
  
  const taskArn = result.tasks[0].taskArn;
  if (!taskArn) {
    throw new Error('ECS task started but no ARN returned');
  }
  
  console.log(`ECS task started successfully: ${taskArn}`);
  return taskArn;
};

const processRecord = async (record: SQSRecord): Promise<ProcessingResult> => {
  try {
    console.log(`Processing SQS record: ${record.messageId}`);
    
    const message = parseMessage(record);
    console.log('Video processing request:', {
      videoId: message.videoId,
      bucketName: message.bucketName,
      fileName: message.fileName,
      timestamp: message.timestamp
    });
    
    const taskArn = await startECSTask(message);
    
    return {
      messageId: record.messageId,
      videoId: message.videoId,
      taskArn,
      status: 'started'
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing SQS message:', {
      messageId: record.messageId,
      error: errorMessage
    });
    
    return {
      messageId: record.messageId,
      status: 'failed',
      error: errorMessage
    };
  }
};

export const handler: SQSHandler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.log('Lambda function started:', {
    requestId: context.awsRequestId,
    remainingTimeInMillis: context.getRemainingTimeInMillis(),
    recordCount: event.Records.length
  });
  
  try {
    validateEnvironment();
    
    const results: ProcessingResult[] = [];
    let hasFailures = false;
    
    // Process records sequentially to avoid overwhelming ECS
    for (const record of event.Records) {
      const result = await processRecord(record);
      results.push(result);
      
      if (result.status === 'failed') {
        hasFailures = true;
      }
    }
    
    console.log('Lambda execution completed:', {
      totalMessages: event.Records.length,
      successful: results.filter(r => r.status === 'started').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    });
    
    // If any record failed, throw error to trigger SQS retry
    if (hasFailures) {
      const failedResults = results.filter(r => r.status === 'failed');
      throw new Error(`Failed to process ${failedResults.length} message(s): ${failedResults.map(r => r.error).join(', ')}`);
    }
    
    // SQSHandler expects void or SQSBatchResponse, not a custom response
    return;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Lambda execution failed:', {
      error: errorMessage,
      requestId: context.awsRequestId
    });
    
    // Re-throw to trigger SQS retry mechanism
    throw error;
  }
};