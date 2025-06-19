# VisionSync Complete Infrastructure Deployment

# Step 1: Initial Setup
echo "🚀 VisionSync Infrastructure Deployment"

# Prerequisites check
aws --version    # Should be installed
docker --version # Should be installed  
node --version   # Should be 18+

# Configure AWS (if not done)
aws configure
# Enter: Access Key, Secret Key, Region (ap-southeast-1), Output (json)

# Step 2: Create Project Structure
mkdir vision-sync-infrastructure
cd vision-sync-infrastructure

# Create directories
mkdir -p lambda/src
mkdir -p container/src  
mkdir -p pulumi

# Step 3: Copy Code Files
# Copy all the TypeScript files from the artifacts above into:
# - lambda/src/index.ts
# - lambda/package.json  
# - lambda/tsconfig.json
# - container/src/process-video.ts
# - container/package.json
# - container/tsconfig.json
# - container/Dockerfile
# - pulumi/index.ts
# - pulumi/package.json
# - pulumi/tsconfig.json

# Step 4: Build Lambda
cd lambda
npm install
npm run build
# Should create dist/index.js
cd ..

# Step 5: Build Container  
cd container
npm install
npm run build
# Should create dist/process-video.js

# Build and push Docker image
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=ap-southeast-1
export ECR_REPO=vision-sync-video-processor

# Create ECR repo
aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION || true

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push
docker build -t $ECR_REPO .
docker tag $ECR_REPO:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest

echo "✅ Container pushed to ECR"
cd ..

# Step 6: Deploy Infrastructure
cd pulumi

# Install Pulumi (if needed)
curl -fsSL https://get.pulumi.com | sh
export PATH=$PATH:$HOME/.pulumi/bin

# Install dependencies
npm install

# Initialize stack
pulumi stack init dev
pulumi config set aws:region ap-southeast-1

# Deploy infrastructure
pulumi up --yes

echo "✅ Infrastructure deployed!"

# Step 7: Get Outputs
echo "📊 Deployment Results:"
echo "======================"

RAW_BUCKET=$(pulumi stack output rawVideosBucketName)
PROCESSED_BUCKET=$(pulumi stack output processedVideosBucketName)  
SQS_URL=$(pulumi stack output videoProcessingQueueUrl)
ECS_CLUSTER=$(pulumi stack output ecsClusterName)
ECR_URL=$(pulumi stack output ecrRepositoryUrl)
LAMBDA_FUNCTION=$(pulumi stack output lambdaFunctionName)

echo "Raw Videos Bucket: $RAW_BUCKET"
echo "Processed Videos Bucket: $PROCESSED_BUCKET"
echo "SQS Queue URL: $SQS_URL"
echo "ECS Cluster: $ECS_CLUSTER"
echo "ECR Repository: $ECR_URL"
echo "Lambda Function: $LAMBDA_FUNCTION"

# Step 8: Update Server Environment
echo ""
echo "🔧 Add these to your server .env file:"
echo "======================================"
echo "S3_BUCKET_RAW=$RAW_BUCKET"
echo "S3_BUCKET_PROCESSED=$PROCESSED_BUCKET"
echo "SQS_QUEUE_URL=$SQS_URL"

# Step 9: Management Commands
echo ""
echo "📚 Useful Management Commands:"
echo "============================="
echo ""
echo "# View all outputs:"
echo "pulumi stack output"
echo ""
echo "# Update infrastructure:"
echo "pulumi up"
echo ""
echo "# View Lambda logs:"
echo "aws logs tail /aws/lambda/$LAMBDA_FUNCTION --follow"
echo ""
echo "# View ECS logs:"  
echo "aws logs tail /ecs/vision-sync-video-processing-dev --follow"
echo ""
echo "# Check SQS queue:"
echo "aws sqs get-queue-attributes --queue-url '$SQS_URL' --attribute-names All"
echo ""
echo "# Rebuild container:"
echo "cd container && npm run build"
echo "docker build -t $ECR_REPO ."
echo "docker tag $ECR_REPO:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest"
echo "docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest"
echo ""
echo "# Destroy everything (CAREFUL!):"
echo "pulumi destroy"

cd ..

echo ""
echo "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "💡 Your VisionSync infrastructure is ready!"

# Optional: Make deployment script executable
chmod +x deploy.sh