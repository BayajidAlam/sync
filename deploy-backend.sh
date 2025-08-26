#!/bin/bash

# Simple Backend Deployment Script
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Deploying Backend to AWS${NC}"

# Check prerequisites
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found${NC}"
    exit 1
fi

if ! command -v pulumi &> /dev/null; then
    echo -e "${RED}❌ Pulumi not found${NC}"
    exit 1
fi

# Generate SSH key if not exists
SSH_KEY="$HOME/.ssh/vision-sync-backend"
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${YELLOW}📋 Generating SSH key...${NC}"
    ssh-keygen -t rsa -b 2048 -f "$SSH_KEY" -N "" -C "vision-sync-backend"
fi

# Set Pulumi config
cd IaC
echo -e "${YELLOW}📋 Setting Pulumi config...${NC}"
pulumi config set sshPublicKey "$(cat $SSH_KEY.pub)"

# Deploy infrastructure
echo -e "${YELLOW}📋 Deploying infrastructure...${NC}"
pulumi up --yes

# Get outputs
BACKEND_IP=$(pulumi stack output backendPublicIp)
ECR_URL=$(pulumi stack output ecrRepositoryUrl)
AWS_REGION=$(aws configure get region || echo "ap-southeast-1")

echo -e "${GREEN}✅ Backend IP: $BACKEND_IP${NC}"
echo -e "${GREEN}✅ ECR URL: $ECR_URL${NC}"

# Build and push backend Docker image
cd ..
echo -e "${YELLOW}📋 Building backend Docker image...${NC}"

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URL

# Build image
docker build -f Dockerfile.backend -t vision-sync-backend .
docker tag vision-sync-backend:latest $ECR_URL:backend-latest
docker push $ECR_URL:backend-latest

echo -e "${GREEN}✅ Backend image pushed to ECR${NC}"

# Wait for instance to be ready
echo -e "${YELLOW}📋 Waiting for instance to be ready...${NC}"
for i in {1..30}; do
    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$SSH_KEY" ubuntu@"$BACKEND_IP" "echo ready" 2>/dev/null; then
        echo -e "${GREEN}✅ Instance ready${NC}"
        break
    fi
    echo -n "."
    sleep 10
done

# Get AWS values for env
cd IaC
RAW_BUCKET=$(pulumi stack output rawVideosBucketName)
PROCESSED_BUCKET=$(pulumi stack output processedVideosBucketName)
SQS_QUEUE_URL=$(pulumi stack output videoProcessingQueueUrl)
CLOUDFRONT_DOMAIN=$(pulumi stack output cloudfrontDomain)

# Deploy backend via SSH
echo -e "${YELLOW}📋 Deploying backend container...${NC}"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" ubuntu@"$BACKEND_IP" << EOF
set -e

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URL

# Stop existing container
docker stop vision-sync-backend 2>/dev/null || true
docker rm vision-sync-backend 2>/dev/null || true

# Run new container
docker run -d --name vision-sync-backend \
  --restart unless-stopped \
  -p 5000:5000 \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e AWS_REGION=$AWS_REGION \
  -e S3_BUCKET_RAW=$RAW_BUCKET \
  -e S3_BUCKET_PROCESSED=$PROCESSED_BUCKET \
  -e SQS_QUEUE_URL="$SQS_QUEUE_URL" \
  -e CLOUDFRONT_DOMAIN=$CLOUDFRONT_DOMAIN \
  -e FRONTEND_URL=http://localhost:3000 \
  -e CORS_ORIGIN=* \
  $ECR_URL:backend-latest

echo "Backend container started"
EOF

# Update Lambda with webhook URL
echo -e "${YELLOW}📋 Updating Lambda webhook URL...${NC}"
LAMBDA_NAME=$(pulumi stack output lambdaFunctionName)
WEBHOOK_URL="http://$BACKEND_IP:5000/api/webhook/processing-complete"

aws lambda update-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --environment Variables="{ECS_CLUSTER=$(pulumi stack output ecsClusterName),ECS_TASK_DEFINITION=$(pulumi stack output ecsTaskDefinition | cut -d'/' -f2),SUBNET_IDS=$(pulumi stack output privateSubnetIds | tr -d '[]" ' | tr ',' ' '),SECURITY_GROUP_ID=$(aws ec2 describe-security-groups --filters Name=group-name,Values=default Name=vpc-id,Values=$(pulumi stack output vpcId) --query SecurityGroups[0].GroupId --output text),PROCESSED_BUCKET=$PROCESSED_BUCKET,REGION=$AWS_REGION,WEBHOOK_URL=$WEBHOOK_URL}" \
  --region $AWS_REGION

echo -e "${GREEN}✅ Lambda updated with webhook URL${NC}"

# Test deployment
echo -e "${YELLOW}📋 Testing deployment...${NC}"
sleep 15
if curl -f -s "http://$BACKEND_IP:5000/health" > /dev/null; then
    echo -e "${GREEN}✅ Backend health check passed${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "================================"
echo -e "Backend URL: ${GREEN}http://$BACKEND_IP:5000${NC}"
echo -e "Webhook URL: ${GREEN}$WEBHOOK_URL${NC}"
echo -e "SSH Access: ${GREEN}ssh -i $SSH_KEY ubuntu@$BACKEND_IP${NC}"
echo ""
echo "Update your client to use: http://$BACKEND_IP:5000"
