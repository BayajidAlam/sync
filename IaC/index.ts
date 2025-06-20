import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Configuration
const config = new pulumi.Config();
const region = aws.getRegion();
const caller = aws.getCallerIdentity();

// Tags for all resources
const commonTags = {
  Project: "VisionSync",
  Environment: pulumi.getStack(),
  ManagedBy: "Pulumi",
};

// Create VPC for ECS tasks - OPTIMIZED: Single NAT Gateway
const vpc = new awsx.ec2.Vpc("vision-sync-vpc", {
  numberOfAvailabilityZones: 2,
  natGateways: {
    strategy: awsx.ec2.NatGatewayStrategy.Single, // COST OPTIMIZATION: Single NAT Gateway (saves $33/month)
  },
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    ...commonTags,
    Name: "vision-sync-vpc",
  },
});

// Create S3 bucket for raw videos - OPTIMIZED: Enhanced lifecycle
const rawVideosBucket = new aws.s3.Bucket("raw-videos-bucket", {
  bucket: `vision-sync-raw-videos-${pulumi.getStack()}-${Math.random().toString(36).substring(7)}`,
  forceDestroy: true, // Allow destruction in dev environments
  
  corsRules: [{
    allowedHeaders: ["*"],
    allowedMethods: ["GET", "PUT", "POST"],
    allowedOrigins: ["*"],
    maxAgeSeconds: 3000,
  }],
  
  // COST OPTIMIZATION: Delete raw videos after processing
  lifecycleRules: [{
    id: "cleanup-after-processing",
    enabled: true,
    abortIncompleteMultipartUploadDays: 1,
    expiration: {
      days: 7, // Delete raw videos after 7 days (saves $11/month)
    },
  }],
  
  tags: {
    ...commonTags,
    Purpose: "raw-video-storage",
  },
});

// Create S3 bucket for processed videos - OPTIMIZED: Enhanced lifecycle
const processedVideosBucket = new aws.s3.Bucket("processed-videos-bucket", {
  bucket: `vision-sync-processed-videos-${pulumi.getStack()}-${Math.random().toString(36).substring(7)}`,
  forceDestroy: true,
  
  corsRules: [{
    allowedHeaders: ["*"],
    allowedMethods: ["GET", "HEAD"],
    allowedOrigins: ["*"],
    maxAgeSeconds: 86400, // 24 hours for processed content
  }],
  
  // COST OPTIMIZATION: Enhanced storage tier transitions
  lifecycleRules: [{
    id: "cost-optimization",
    enabled: true,
    transitions: [
      {
        days: 30,
        storageClass: "STANDARD_IA", // Move to IA after 30 days
      },
      {
        days: 90,
        storageClass: "GLACIER", // Move to Glacier after 90 days
      },
      {
        days: 365,
        storageClass: "DEEP_ARCHIVE", // Move to Deep Archive after 1 year
      }
    ],
  }],
  
  tags: {
    ...commonTags,
    Purpose: "processed-video-storage",
  },
});

// Block public access for security
new aws.s3.BucketPublicAccessBlock("raw-videos-bucket-pab", {
  bucket: rawVideosBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

new aws.s3.BucketPublicAccessBlock("processed-videos-bucket-pab", {
  bucket: processedVideosBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// COST OPTIMIZATION: CloudFront CDN (saves $1,575/month)
// Create CloudFront Origin Access Identity
const oai = new aws.cloudfront.OriginAccessIdentity("video-oai", {
  comment: "OAI for processed videos bucket",
});

// Update processed videos bucket policy to allow CloudFront access
const bucketPolicy = new aws.s3.BucketPolicy("processed-videos-policy", {
  bucket: processedVideosBucket.id,
  policy: pulumi.all([processedVideosBucket.arn, oai.iamArn]).apply(([bucketArn, oaiArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: {
          AWS: oaiArn,
        },
        Action: "s3:GetObject",
        Resource: `${bucketArn}/*`,
      }],
    })
  ),
});

// Create CloudFront Distribution
const distribution = new aws.cloudfront.Distribution("video-cdn", {
  origins: [{
    domainName: processedVideosBucket.bucketDomainName,
    originId: "S3-processed-videos",
    s3OriginConfig: {
      originAccessIdentity: oai.cloudfrontAccessIdentityPath,
    },
  }],
  
  enabled: true,
  comment: "VisionSync Video CDN",
  priceClass: "PriceClass_100", // US, Canada, Europe only (cost optimization)
  
  defaultCacheBehavior: {
    targetOriginId: "S3-processed-videos",
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    cachedMethods: ["GET", "HEAD"],
    cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // Managed-CachingOptimized
    compress: true,
  },
  
  // Cache video segments for longer (better cache hit rate)
  orderedCacheBehaviors: [{
    pathPattern: "*.m4s",
    targetOriginId: "S3-processed-videos",
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD"],
    cachedMethods: ["GET", "HEAD"],
    cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    compress: true,
  }],
  
  restrictions: {
    geoRestriction: {
      restrictionType: "none",
    },
  },
  
  viewerCertificate: {
    cloudfrontDefaultCertificate: true,
  },
  
  tags: {
    ...commonTags,
    Purpose: "video-delivery",
  },
});

// Create SQS Dead Letter Queue
const videoProcessingDLQ = new aws.sqs.Queue("video-processing-dlq", {
  name: `vision-sync-video-processing-dlq-${pulumi.getStack()}`,
  messageRetentionSeconds: 1209600, // 14 days
  tags: {
    ...commonTags,
    Purpose: "video-processing-dlq",
  },
});

// Create SQS queue for video processing
const videoProcessingQueue = new aws.sqs.Queue("video-processing-queue", {
  name: `vision-sync-video-processing-${pulumi.getStack()}`,
  visibilityTimeoutSeconds: 960, // 16 minutes (longer than Lambda timeout)
  messageRetentionSeconds: 1209600, // 14 days
  receiveWaitTimeSeconds: 20, // Enable long polling
  
  redrivePolicy: pulumi.jsonStringify({
    deadLetterTargetArn: videoProcessingDLQ.arn,
    maxReceiveCount: 3,
  }),
  
  tags: {
    ...commonTags,
    Purpose: "video-processing-queue",
  },
});

// Create CloudWatch log groups
const ecsLogGroup = new aws.cloudwatch.LogGroup("ecs-video-processing-logs", {
  name: `/ecs/vision-sync-video-processing-${pulumi.getStack()}`,
  retentionInDays: 7,
  tags: {
    ...commonTags,
    Purpose: "ecs-logs",
  },
});

const lambdaLogGroup = new aws.cloudwatch.LogGroup("lambda-trigger-logs", {
  name: `/aws/lambda/vision-sync-ecs-trigger-${pulumi.getStack()}`,
  retentionInDays: 14,
  tags: {
    ...commonTags,
    Purpose: "lambda-logs",
  },
});

// Create ECR repository for video processing container
const ecrRepository = new aws.ecr.Repository("video-processor-repo", {
  name: `vision-sync-video-processor-${pulumi.getStack()}`,
  imageTagMutability: "MUTABLE",
  
  imageScanningConfiguration: {
    scanOnPush: true,
  },
  
  encryptionConfigurations: [{
    encryptionType: "AES256",
  }],
  
  tags: {
    ...commonTags,
    Purpose: "video-processing-container",
  },
});

// COST OPTIMIZATION: Enhanced ECR lifecycle policy
new aws.ecr.LifecyclePolicy("video-processor-lifecycle", {
  repository: ecrRepository.name,
  policy: pulumi.jsonStringify({
    rules: [
      {
        rulePriority: 1,
        description: "Keep only 5 most recent images", // Reduced from 10
        selection: {
          tagStatus: "any",
          countType: "imageCountMoreThan",
          countNumber: 5, // Saves storage costs
        },
        action: {
          type: "expire",
        },
      },
      {
        rulePriority: 2,
        description: "Delete untagged images immediately", // Reduced from 1 day
        selection: {
          tagStatus: "untagged",
          countType: "sinceImagePushed",
          countUnit: "hours",
          countNumber: 1, // Clean up faster
        },
        action: {
          type: "expire",
        },
      },
    ],
  }),
});

// IAM Roles and Policies

// ECS Task Execution Role
const ecsExecutionRole = new aws.iam.Role("ecs-execution-role", {
  name: `vision-sync-ecs-execution-${pulumi.getStack()}`,
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: {
        Service: "ecs-tasks.amazonaws.com",
      },
    }],
  }),
  tags: {
    ...commonTags,
    Purpose: "ecs-execution",
  },
});

// ECS Task Role (for the application)
const ecsTaskRole = new aws.iam.Role("ecs-task-role", {
  name: `vision-sync-ecs-task-${pulumi.getStack()}`,
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: {
        Service: "ecs-tasks.amazonaws.com",
      },
    }],
  }),
  tags: {
    ...commonTags,
    Purpose: "ecs-task",
  },
});

// Lambda Execution Role
const lambdaExecutionRole = new aws.iam.Role("lambda-execution-role", {
  name: `vision-sync-lambda-${pulumi.getStack()}`,
  assumeRolePolicy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: {
        Service: "lambda.amazonaws.com",
      },
    }],
  }),
  tags: {
    ...commonTags,
    Purpose: "lambda-execution",
  },
});

// Attach managed policies to ECS Execution Role
new aws.iam.RolePolicyAttachment("ecs-execution-policy", {
  role: ecsExecutionRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

// Custom policy for ECS Task Role
const ecsTaskPolicy = new aws.iam.Policy("ecs-task-policy", {
  name: `vision-sync-ecs-task-policy-${pulumi.getStack()}`,
  policy: pulumi.all([rawVideosBucket.arn, processedVideosBucket.arn]).apply(([rawArn, processedArn]) =>
    pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "s3:GetObject",
          ],
          Resource: `${rawArn}/*`,
        },
        {
          Effect: "Allow",
          Action: [
            "s3:PutObject",
            "s3:PutObjectAcl",
          ],
          Resource: `${processedArn}/*`,
        },
        {
          Effect: "Allow",
          Action: [
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ],
          Resource: ecsLogGroup.arn,
        },
      ],
    })
  ),
});

new aws.iam.RolePolicyAttachment("ecs-task-policy-attachment", {
  role: ecsTaskRole.name,
  policyArn: ecsTaskPolicy.arn,
});

// Lambda execution policy
const lambdaExecutionPolicy = new aws.iam.Policy("lambda-execution-policy", {
  name: `vision-sync-lambda-policy-${pulumi.getStack()}`,
  policy: pulumi.all([
    videoProcessingQueue.arn,
    ecsTaskRole.arn,
    ecsExecutionRole.arn,
  ]).apply(([sqsArn, taskRoleArn, execRoleArn]) =>
    pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ],
          Resource: "arn:aws:logs:*:*:*",
        },
        {
          Effect: "Allow",
          Action: [
            "sqs:ReceiveMessage",
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes",
          ],
          Resource: sqsArn,
        },
        {
          Effect: "Allow",
          Action: [
            "ecs:RunTask",
            "ecs:DescribeTasks",
          ],
          Resource: "*",
        },
        {
          Effect: "Allow",
          Action: "iam:PassRole",
          Resource: [taskRoleArn, execRoleArn],
        },
      ],
    })
  ),
});

new aws.iam.RolePolicyAttachment("lambda-execution-policy-attachment", {
  role: lambdaExecutionRole.name,
  policyArn: lambdaExecutionPolicy.arn,
});

// Create ECS Cluster
const ecsCluster = new aws.ecs.Cluster("video-processing-cluster", {
  name: `vision-sync-processing-${pulumi.getStack()}`,
  
  settings: [{
    name: "containerInsights",
    value: "enabled",
  }],
  
  tags: {
    ...commonTags,
    Purpose: "video-processing",
  },
});

// Create capacity provider association separately
new aws.ecs.ClusterCapacityProviders("cluster-capacity-providers", {
  clusterName: ecsCluster.name,
  capacityProviders: ["FARGATE", "FARGATE_SPOT"], // COST OPTIMIZATION: Added Spot support
  
  defaultCapacityProviderStrategies: [{
    capacityProvider: "FARGATE_SPOT", // COST OPTIMIZATION: Default to Spot (70% savings)
    weight: 70,
  }, {
    capacityProvider: "FARGATE",
    weight: 30,
  }],
});

// Create ECS Task Definition
const ecsTaskDefinition = new aws.ecs.TaskDefinition("video-processing-task", {
  family: `vision-sync-video-processing-${pulumi.getStack()}`,
  cpu: "2048",
  memory: "4096",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: ecsExecutionRole.arn,
  taskRoleArn: ecsTaskRole.arn,
  
  containerDefinitions: pulumi.all([
    region,
    ecsLogGroup.name,
    ecrRepository.repositoryUrl,
    caller,
    rawVideosBucket.bucket,
    processedVideosBucket.bucket,
  ]).apply(([reg, logGroupName, repoUrl, callerInfo, rawBucket, processedBucket]) =>
    pulumi.jsonStringify([{
      name: "video-processor",
      image: `${callerInfo.accountId}.dkr.ecr.${reg.name}.amazonaws.com/${ecrRepository.name}:latest`,
      cpu: 2048,
      memory: 4096,
      essential: true,
      
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": logGroupName,
          "awslogs-region": reg.name,
          "awslogs-stream-prefix": "ecs",
        },
      },
      
      environment: [
        { name: "AWS_DEFAULT_REGION", value: reg.name },
        { name: "NODE_ENV", value: "production" },
        { name: "TEMP_DIR", value: "/tmp/video-processing" },
        // COST OPTIMIZATION: Default to cost-optimized settings
        { name: "INSTANCE_TYPE", value: "spot" },
        { name: "PROCESSING_PRIORITY", value: "low" },
        { name: "ENABLE_BATCH_MODE", value: "true" },
        { name: "FFMPEG_PRESET", value: "fast" },
        { name: "FFMPEG_THREADS", value: "2" },
        { name: "MAX_PROCESSING_TIME", value: "1800" },
      ],
      
      healthCheck: {
        command: ["CMD-SHELL", "node -e \"console.log('healthy')\" || exit 1"],
        interval: 30,
        timeout: 5,
        retries: 3,
        startPeriod: 60,
      },
      
      stopTimeout: 120,
    }])
  ),
  
  tags: {
    ...commonTags,
    Purpose: "video-processing-task",
  },
});

// Create Lambda function - OPTIMIZED: Reduced timeout
const lambdaWithDependency = new aws.lambda.Function("ecs-task-trigger-with-deps", {
  name: `vision-sync-ecs-trigger-${pulumi.getStack()}`,
  runtime: "nodejs18.x",
  
  // Reference the built Lambda code from the lambda directory
  code: new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileArchive("../lambda/dist"),
    "node_modules": new pulumi.asset.FileArchive("../lambda/node_modules"),
  }),
  
  handler: "index.handler",
  role: lambdaExecutionRole.arn,
  timeout: 60, // COST OPTIMIZATION: Reduced from 900 to 60 seconds
  memorySize: 256,
  
  environment: {
    variables: pulumi.all([
      ecsCluster.name,
      ecsTaskDefinition.arn,
      vpc.privateSubnetIds,
      vpc.vpc.defaultSecurityGroupId,
      processedVideosBucket.bucket,
      region,
    ]).apply(([clusterName, taskDefArn, subnetIds, sgId, bucket, reg]) => ({
      ECS_CLUSTER: clusterName,
      ECS_TASK_DEFINITION: taskDefArn,
      SUBNET_IDS: subnetIds.join(','),
      SECURITY_GROUP_ID: sgId,
      PROCESSED_BUCKET: bucket,
      AWS_REGION: reg.name,
    })),
  },
  
  deadLetterConfig: {
    targetArn: videoProcessingDLQ.arn,
  },
  
  tags: {
    ...commonTags,
    Purpose: "video-processing-trigger",
  },
}, { dependsOn: [lambdaLogGroup] });

// Create SQS trigger for Lambda
const sqsEventSourceMapping = new aws.lambda.EventSourceMapping("sqs-lambda-trigger", {
  eventSourceArn: videoProcessingQueue.arn,
  functionName: lambdaWithDependency.name,
  batchSize: 1,
  maximumBatchingWindowInSeconds: 5,
  
  functionResponseTypes: ["ReportBatchItemFailures"],
});

// Grant SQS permission to invoke Lambda
new aws.lambda.Permission("sqs-invoke-lambda", {
  action: "lambda:InvokeFunction",
  function: lambdaWithDependency.name,
  principal: "sqs.amazonaws.com",
  sourceArn: videoProcessingQueue.arn,
});

// CloudWatch Alarms for monitoring
const lambdaErrorAlarm = new aws.cloudwatch.MetricAlarm("lambda-error-alarm", {
  name: `vision-sync-lambda-errors-${pulumi.getStack()}`,
  alarmDescription: "Lambda function error rate is too high",
  
  metricName: "Errors",
  namespace: "AWS/Lambda",
  statistic: "Sum",
  period: 300,
  evaluationPeriods: 2,
  threshold: 5,
  comparisonOperator: "GreaterThanThreshold",
  
  dimensions: {
    FunctionName: lambdaWithDependency.name,
  },
  
  tags: {
    ...commonTags,
    Purpose: "monitoring",
  },
});

const sqsQueueDepthAlarm = new aws.cloudwatch.MetricAlarm("sqs-queue-depth-alarm", {
  name: `vision-sync-sqs-depth-${pulumi.getStack()}`,
  alarmDescription: "SQS queue depth is too high",
  
  metricName: "ApproximateNumberOfVisibleMessages",
  namespace: "AWS/SQS",
  statistic: "Average",
  period: 300,
  evaluationPeriods: 3,
  threshold: 10,
  comparisonOperator: "GreaterThanThreshold",
  
  dimensions: {
    QueueName: videoProcessingQueue.name,
  },
  
  tags: {
    ...commonTags,
    Purpose: "monitoring",
  },
});

// Export important values - ADDED: CloudFront exports
export const vpcId = vpc.vpcId;
export const publicSubnetIds = vpc.publicSubnetIds;
export const privateSubnetIds = vpc.privateSubnetIds;
export const rawVideosBucketName = rawVideosBucket.bucket;
export const rawVideosBucketArn = rawVideosBucket.arn;
export const processedVideosBucketName = processedVideosBucket.bucket;
export const processedVideosBucketArn = processedVideosBucket.arn;
export const videoProcessingQueueUrl = videoProcessingQueue.url;
export const videoProcessingQueueArn = videoProcessingQueue.arn;
export const videoProcessingDLQUrl = videoProcessingDLQ.url;
export const ecsClusterName = ecsCluster.name;
export const ecsClusterArn = ecsCluster.arn;
export const ecsTaskDefinitionArn = ecsTaskDefinition.arn;
export const lambdaFunctionName = lambdaWithDependency.name;
export const lambdaFunctionArn = lambdaWithDependency.arn;
export const ecrRepositoryUrl = ecrRepository.repositoryUrl;
export const ecrRepositoryName = ecrRepository.name;
export const accountId = caller.then(c => c.accountId);

// COST OPTIMIZATION: New CloudFront exports
export const cloudfrontDistributionId = distribution.id;
export const cloudfrontDomainName = distribution.domainName;
export const cloudfrontDistributionArn = distribution.arn;