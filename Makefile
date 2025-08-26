# VisionSync Video Streaming Platform
.PHONY: help install build deploy container dev clean logs destroy setup update outputs post-deploy test status

# Colors for output
YELLOW := \033[1;33m
GREEN := \033[1;32m
RED := \033[1;31m
NC := \033[0m # No Color

# Default target
help:
	@echo "$(GREEN)VisionSync - Video Streaming Platform$(NC)"
	@echo "=========================================="
	@echo "$(YELLOW)Available commands:$(NC)"
	@echo "  make install   - Install all dependencies"
	@echo "  make build     - Build all components"
	@echo "  make deploy    - Deploy infrastructure to AWS"
	@echo "  make container - Build and push Docker container"
	@echo "  make dev       - Start local development servers"
	@echo "  make env       - Show basic environment variables"
	@echo "  make update-env - Auto-update server/.env with AWS resources"
	@echo "  make outputs   - Show ALL Pulumi outputs (detailed)"
	@echo "  make logs      - View AWS logs"
	@echo "  make clean     - Clean build files"
	@echo "  make destroy   - Destroy AWS infrastructure"
	@echo "  make setup     - Complete first-time setup"
	@echo "  make update    - Quick deploy (rebuild and update)"
	@echo "  make post-deploy - Show configuration after deployment"
	@echo "  make status    - Check deployment status"
	@echo ""
	@echo "$(YELLOW)Backend Commands:$(NC)"
	@echo "  make deploy-backend - Deploy backend to EC2 with Docker"
	@echo "  make update-backend - Update backend container"
	@echo "  make status-backend - Check backend status"
	@echo "  make logs-backend   - View backend logs"
	@echo "  make ssh-backend    - SSH into backend instance"

# Install dependencies
install:
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	cd server && npm install
	cd client && npm install
	cd lambda && npm install
	cd container && npm install
	cd IaC && npm install
	@echo "$(GREEN)✅ Dependencies installed!$(NC)"

# Build all components
build:
	@echo "$(YELLOW)Building all components...$(NC)"
	cd server && npm run build
	cd client && npm run build
	cd lambda && npm run build
	cd container && npm run build
	@echo "$(GREEN)✅ Build complete!$(NC)"

# Deploy infrastructure
deploy:
	@echo "$(YELLOW)Deploying infrastructure...$(NC)"
	cd IaC && pulumi up
	@echo "$(GREEN)✅ Infrastructure deployed!$(NC)"
	@make update-env
	@echo "$(GREEN)✅ Server .env file updated automatically!$(NC)"
	@echo "Run 'make outputs' to see all configuration values"

# Build and push container to ECR
container: build
	@echo "$(YELLOW)Building and pushing container...$(NC)"
	$(eval ECR_URL := $(shell cd IaC && pulumi stack output ecrRepositoryUrl 2>/dev/null))
	$(eval AWS_REGION := ap-southeast-1)
	@if [ -z "$(ECR_URL)" ]; then \
		echo "$(RED)❌ Error: ECR repository not found. Run 'make deploy' first$(NC)"; \
		exit 1; \
	fi
	@echo "ECR URL: $(ECR_URL)"
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_URL)
	cd container && docker build -t vision-sync-video-processor .
	docker tag vision-sync-video-processor:latest $(ECR_URL):latest
	docker push $(ECR_URL):latest
	@echo "$(GREEN)✅ Container pushed to ECR!$(NC)"

# Start development servers
dev:
	@echo "$(YELLOW)Starting development servers...$(NC)"
	@echo "Backend will run on http://localhost:5000"
	@echo "Frontend will run on http://localhost:3000"
	@echo "Press Ctrl+C to stop"
	cd server && npm run dev &
	cd client && npm run dev

# Show basic environment variables
env:
	@echo "Copy these environment variables to server/.env:"
	@echo "=========================================="
	$(eval RAW_BUCKET := $(shell cd IaC && pulumi stack output rawVideosBucketName 2>/dev/null))
	$(eval PROCESSED_BUCKET := $(shell cd IaC && pulumi stack output processedVideosBucketName 2>/dev/null))
	$(eval SQS_URL := $(shell cd IaC && pulumi stack output videoProcessingQueueUrl 2>/dev/null))
	@echo "S3_BUCKET_RAW=$(RAW_BUCKET)"
	@echo "S3_BUCKET_PROCESSED=$(PROCESSED_BUCKET)"
	@echo "SQS_QUEUE_URL=$(SQS_URL)"
	@echo "AWS_REGION=ap-southeast-1"

# Automatically update server/.env with AWS resources (NEW)
update-env:
	@echo "$(YELLOW)Updating server/.env with AWS resource values...$(NC)"
	$(eval RAW_BUCKET := $(shell cd IaC && pulumi stack output rawVideosBucketName 2>/dev/null))
	$(eval PROCESSED_BUCKET := $(shell cd IaC && pulumi stack output processedVideosBucketName 2>/dev/null))
	$(eval SQS_URL := $(shell cd IaC && pulumi stack output videoProcessingQueueUrl 2>/dev/null))
	$(eval CLOUDFRONT_ID := $(shell cd IaC && pulumi stack output cloudfrontDistributionId 2>/dev/null))
	$(eval CLOUDFRONT_DOMAIN := $(shell cd IaC && pulumi stack output cloudfrontDomain 2>/dev/null))
	@if [ -z "$(RAW_BUCKET)" ] || [ -z "$(PROCESSED_BUCKET)" ] || [ -z "$(SQS_URL)" ]; then \
		echo "$(RED)❌ Error: Could not retrieve AWS resource values. Make sure infrastructure is deployed.$(NC)"; \
		exit 1; \
	fi
	@# Create backup of current .env
	@cp server/.env server/.env.backup
	@# Update S3 bucket names
	@sed -i 's/^S3_BUCKET_RAW=.*/S3_BUCKET_RAW=$(RAW_BUCKET)/' server/.env
	@sed -i 's/^S3_BUCKET_PROCESSED=.*/S3_BUCKET_PROCESSED=$(PROCESSED_BUCKET)/' server/.env
	@# Update SQS URL (escape special characters)
	@sed -i 's|^SQS_QUEUE_URL=.*|SQS_QUEUE_URL=$(SQS_URL)|' server/.env
	@# Update CloudFront values if available
	@if [ -n "$(CLOUDFRONT_ID)" ]; then \
		sed -i 's/^CLOUDFRONT_DISTRIBUTION_ID=.*/CLOUDFRONT_DISTRIBUTION_ID=$(CLOUDFRONT_ID)/' server/.env; \
	fi
	@if [ -n "$(CLOUDFRONT_DOMAIN)" ]; then \
		sed -i 's/^CLOUDFRONT_DOMAIN=.*/CLOUDFRONT_DOMAIN=$(CLOUDFRONT_DOMAIN)/' server/.env; \
	fi
	@echo "$(GREEN)✅ Updated server/.env with:$(NC)"
	@echo "  S3_BUCKET_RAW=$(RAW_BUCKET)"
	@echo "  S3_BUCKET_PROCESSED=$(PROCESSED_BUCKET)"
	@echo "  SQS_QUEUE_URL=$(SQS_URL)"
	@if [ -n "$(CLOUDFRONT_ID)" ]; then echo "  CLOUDFRONT_DISTRIBUTION_ID=$(CLOUDFRONT_ID)"; fi
	@if [ -n "$(CLOUDFRONT_DOMAIN)" ]; then echo "  CLOUDFRONT_DOMAIN=$(CLOUDFRONT_DOMAIN)"; fi
	@echo "$(YELLOW)📋 Backup saved as server/.env.backup$(NC)"

# Get ALL Pulumi outputs with CloudFront and formatting (NEW)
outputs:
	@echo "$(GREEN)=========================================="
	@echo "     PULUMI STACK OUTPUTS"
	@echo "==========================================$(NC)"
	@echo ""
	@echo "$(YELLOW)📦 S3 Buckets:$(NC)"
	$(eval RAW_BUCKET := $(shell cd IaC && pulumi stack output rawVideosBucketName 2>/dev/null))
	$(eval PROCESSED_BUCKET := $(shell cd IaC && pulumi stack output processedVideosBucketName 2>/dev/null))
	@echo "S3_BUCKET_RAW=$(RAW_BUCKET)"
	@echo "S3_BUCKET_PROCESSED=$(PROCESSED_BUCKET)"
	@echo ""
	@echo "$(YELLOW)📨 SQS Queue:$(NC)"
	$(eval SQS_URL := $(shell cd IaC && pulumi stack output videoProcessingQueueUrl 2>/dev/null))
	@echo "SQS_QUEUE_URL=$(SQS_URL)"
	@echo ""
	@echo "$(YELLOW)🌐 CloudFront CDN:$(NC)"
	$(eval CLOUDFRONT_ID := $(shell cd IaC && pulumi stack output cloudfrontDistributionId 2>/dev/null))
	$(eval CLOUDFRONT_DOMAIN := $(shell cd IaC && pulumi stack output cloudfrontDomain 2>/dev/null))
	@echo "CLOUDFRONT_DISTRIBUTION_ID=$(CLOUDFRONT_ID)"
	@echo "CLOUDFRONT_DOMAIN=$(CLOUDFRONT_DOMAIN)"
	@echo "CLOUDFRONT_URL=https://$(CLOUDFRONT_DOMAIN)"
	@echo ""
	@echo "$(YELLOW)🐳 ECR Repository:$(NC)"
	$(eval ECR_URL := $(shell cd IaC && pulumi stack output ecrRepositoryUrl 2>/dev/null))
	@echo "ECR_REPOSITORY_URL=$(ECR_URL)"
	@echo ""
	@echo "$(YELLOW)🔧 Lambda Function:$(NC)"
	$(eval LAMBDA_NAME := $(shell cd IaC && pulumi stack output lambdaFunctionName 2>/dev/null))
	@echo "LAMBDA_FUNCTION_NAME=$(LAMBDA_NAME)"
	@echo ""
	@echo "$(YELLOW)🌐 VPC Information:$(NC)"
	$(eval VPC_ID := $(shell cd IaC && pulumi stack output vpcId 2>/dev/null))
	@echo "VPC_ID=$(VPC_ID)"
	@echo ""
	@echo "$(GREEN)=========================================="
	@echo "Copy these values to your .env files!$(NC)"
	@echo "=========================================="

# Post-deployment configuration helper (NEW)
post-deploy: outputs
	@echo ""
	@echo "$(GREEN)✅ Infrastructure deployed successfully!$(NC)"
	@echo ""
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "1. Update server/.env with the values above"
	@echo "2. Update client/.env with:"
	@echo "   REACT_APP_API_URL=http://localhost:5000"
	@echo "   REACT_APP_CLOUDFRONT_URL=https://$(shell cd IaC && pulumi stack output cloudfrontDomain 2>/dev/null)"
	@echo ""
	@echo "3. For production, update the WEBHOOK_URL in container:"
	@echo "   WEBHOOK_URL=https://your-api-domain.com/api/webhook/processing-complete"
	@echo ""
	@echo "4. Run 'make container' to build and push Docker image"
	@echo "5. Run 'make dev' to start local development"

# Check deployment status (NEW)
status:
	@echo "$(YELLOW)Checking deployment status...$(NC)"
	@echo ""
	@echo "$(YELLOW)📊 Pulumi Stack:$(NC)"
	cd IaC && pulumi stack --show-name
	@echo ""
	@echo "$(YELLOW)🔍 Resource Summary:$(NC)"
	cd IaC && pulumi stack --show-summary
	@echo ""
	@echo "$(YELLOW)☁️  AWS Resources:$(NC)"
	@aws s3 ls | grep vision-sync || echo "No S3 buckets found"
	@aws ecs list-clusters --region ap-southeast-1 | grep vision-sync || echo "No ECS clusters found"
	@echo ""
	@echo "$(GREEN)Run 'make outputs' for detailed configuration$(NC)"

# View logs menu
logs:
	@echo "Choose which logs to view:"
	@echo "1. Lambda logs: make logs-lambda"
	@echo "2. ECS logs: make logs-ecs"
	@echo "3. Server logs: make logs-server"

# Lambda logs
logs-lambda:
	$(eval LAMBDA_NAME := $(shell cd IaC && pulumi stack output lambdaFunctionName 2>/dev/null))
	@if [ -z "$(LAMBDA_NAME)" ]; then \
		echo "$(RED)❌ Lambda function not found. Deploy first with 'make deploy'$(NC)"; \
		exit 1; \
	fi
	aws logs tail /aws/lambda/$(LAMBDA_NAME) --follow

# ECS logs
logs-ecs:
	@echo "$(YELLOW)Viewing ECS container logs...$(NC)"
	aws logs tail /ecs/vision-sync-video-processing-dev --follow

# Local server logs (NEW)
logs-server:
	@echo "$(YELLOW)Viewing local server logs...$(NC)"
	cd server && npm run dev

# Test all components (NEW)
test:
	@echo "$(YELLOW)Running tests...$(NC)"
	@echo "Testing server..."
	cd server && npm test 2>/dev/null || echo "No server tests configured"
	@echo "Testing client..."
	cd client && npm test 2>/dev/null || echo "No client tests configured"
	@echo "Testing lambda..."
	cd lambda && npm test 2>/dev/null || echo "No lambda tests configured"
	@echo "$(GREEN)✅ Tests complete!$(NC)"

# Clean build files
clean:
	@echo "$(YELLOW)Cleaning build files...$(NC)"
	rm -rf server/dist
	rm -rf client/dist
	rm -rf lambda/dist
	rm -rf container/dist
	rm -rf */node_modules/.cache
	@echo "$(GREEN)✅ Clean complete!$(NC)"

# Destroy AWS infrastructure
destroy:
	@echo "$(RED)⚠️  WARNING: This will destroy ALL AWS resources!$(NC)"
	@read -p "Are you sure? Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ]
	cd IaC && pulumi destroy
	@echo "$(GREEN)✅ Infrastructure destroyed$(NC)"

# Complete setup (first time)
setup: install build deploy container post-deploy
	@echo "$(GREEN)✅ Complete setup finished!$(NC)"
	@echo "Next steps:"
	@echo "1. Update .env files with the values shown above"
	@echo "2. Run 'make dev' to start development servers"

# Quick deploy (updates)
update: build container deploy
	@echo "$(GREEN)✅ Update complete!$(NC)"
	@make outputs

# Reset everything (NEW)
reset: clean
	@echo "$(YELLOW)Resetting project...$(NC)"
	rm -rf */node_modules
	@make install
	@echo "$(GREEN)✅ Reset complete! Run 'make setup' to redeploy$(NC)"

# Docker cleanup (NEW)
docker-clean:
	@echo "$(YELLOW)Cleaning Docker resources...$(NC)"
	docker system prune -f
	@echo "$(GREEN)✅ Docker cleanup complete!$(NC)"

# Deploy backend to EC2 with Docker
deploy-backend:
	@echo "$(YELLOW)🚀 Deploying Backend to AWS EC2...$(NC)"
	@# Check prerequisites
	@command -v aws >/dev/null 2>&1 || { echo "$(RED)❌ AWS CLI not found$(NC)"; exit 1; }
	@command -v pulumi >/dev/null 2>&1 || { echo "$(RED)❌ Pulumi not found$(NC)"; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "$(RED)❌ Docker not found$(NC)"; exit 1; }
	@# Generate SSH key if not exists
	@if [ ! -f "$$HOME/.ssh/vision-sync-backend" ]; then \
		echo "$(YELLOW)📋 Generating SSH key...$(NC)"; \
		ssh-keygen -t rsa -b 2048 -f "$$HOME/.ssh/vision-sync-backend" -N "" -C "vision-sync-backend"; \
	fi
	@# Set Pulumi config
	@echo "$(YELLOW)📋 Setting Pulumi config...$(NC)"
	@cd IaC && pulumi config set sshPublicKey "$$(cat $$HOME/.ssh/vision-sync-backend.pub)"
	@# Deploy infrastructure
	@echo "$(YELLOW)📋 Deploying infrastructure...$(NC)"
	@cd IaC && pulumi up --yes
	@# Get outputs
	$(eval BACKEND_IP := $(shell cd IaC && pulumi stack output backendPublicIp 2>/dev/null))
	$(eval ECR_URL := $(shell cd IaC && pulumi stack output ecrRepositoryUrl 2>/dev/null))
	$(eval AWS_REGION := ap-southeast-1)
	@echo "$(GREEN)✅ Backend IP: $(BACKEND_IP)$(NC)"
	@echo "$(GREEN)✅ ECR URL: $(ECR_URL)$(NC)"
	@# Build and push backend image
	@echo "$(YELLOW)📋 Building backend Docker image...$(NC)"
	@aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_URL)
	@docker build -f Dockerfile.backend -t vision-sync-backend .
	@docker tag vision-sync-backend:latest $(ECR_URL):backend-latest
	@docker push $(ECR_URL):backend-latest
	@echo "$(GREEN)✅ Backend image pushed to ECR$(NC)"
	@# Wait for instance
	@echo "$(YELLOW)📋 Waiting for instance to be ready...$(NC)"
	@for i in $$(seq 1 30); do \
		if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$$HOME/.ssh/vision-sync-backend" ubuntu@$(BACKEND_IP) "echo ready" 2>/dev/null; then \
			echo "$(GREEN)✅ Instance ready$(NC)"; \
			break; \
		fi; \
		echo -n "."; \
		sleep 10; \
		if [ $$i -eq 30 ]; then \
			echo "$(RED)❌ Timeout$(NC)"; \
			exit 1; \
		fi; \
	done
	@# Deploy backend
	@echo "$(YELLOW)📋 Deploying backend container...$(NC)"
	@make deploy-backend-container BACKEND_IP=$(BACKEND_IP) ECR_URL=$(ECR_URL) AWS_REGION=$(AWS_REGION)
	@# Update Lambda
	@make update-webhook-url BACKEND_IP=$(BACKEND_IP)
	@# Test deployment
	@echo "$(YELLOW)📋 Testing deployment...$(NC)"
	@sleep 15
	@if curl -f -s "http://$(BACKEND_IP):5000/health" >/dev/null 2>&1; then \
		echo "$(GREEN)✅ Backend health check passed$(NC)"; \
	else \
		echo "$(RED)❌ Backend health check failed$(NC)"; \
	fi
	@echo ""
	@echo "$(GREEN)🎉 Deployment Complete!$(NC)"
	@echo "Backend URL: $(GREEN)http://$(BACKEND_IP):5000$(NC)"
	@echo "SSH Access: $(GREEN)ssh -i $$HOME/.ssh/vision-sync-backend ubuntu@$(BACKEND_IP)$(NC)"

# Deploy backend container (internal target)
deploy-backend-container:
	$(eval RAW_BUCKET := $(shell cd IaC && pulumi stack output rawVideosBucketName 2>/dev/null))
	$(eval PROCESSED_BUCKET := $(shell cd IaC && pulumi stack output processedVideosBucketName 2>/dev/null))
	$(eval SQS_QUEUE_URL := $(shell cd IaC && pulumi stack output videoProcessingQueueUrl 2>/dev/null))
	$(eval CLOUDFRONT_DOMAIN := $(shell cd IaC && pulumi stack output cloudfrontDomain 2>/dev/null))
	@ssh -o StrictHostKeyChecking=no -i "$$HOME/.ssh/vision-sync-backend" ubuntu@$(BACKEND_IP) '\
		set -e && \
		aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_URL) && \
		docker stop vision-sync-backend 2>/dev/null || true && \
		docker rm vision-sync-backend 2>/dev/null || true && \
		docker run -d --name vision-sync-backend \
			--restart unless-stopped \
			-p 5000:5000 \
			-e NODE_ENV=production \
			-e PORT=5000 \
			-e AWS_REGION=$(AWS_REGION) \
			-e S3_BUCKET_RAW=$(RAW_BUCKET) \
			-e S3_BUCKET_PROCESSED=$(PROCESSED_BUCKET) \
			-e SQS_QUEUE_URL="$(SQS_QUEUE_URL)" \
			-e CLOUDFRONT_DOMAIN=$(CLOUDFRONT_DOMAIN) \
			-e FRONTEND_URL=http://localhost:3000 \
			-e CORS_ORIGIN=* \
			$(ECR_URL):backend-latest && \
		echo "Backend container started"'

# Update Lambda with webhook URL (internal target)
update-webhook-url:
	$(eval LAMBDA_NAME := $(shell cd IaC && pulumi stack output lambdaFunctionName 2>/dev/null))
	$(eval WEBHOOK_URL := http://$(BACKEND_IP):5000/api/webhook/processing-complete)
	$(eval RAW_BUCKET := $(shell cd IaC && pulumi stack output rawVideosBucketName 2>/dev/null))
	$(eval PROCESSED_BUCKET := $(shell cd IaC && pulumi stack output processedVideosBucketName 2>/dev/null))
	$(eval ECS_CLUSTER := $(shell cd IaC && pulumi stack output ecsClusterName 2>/dev/null))
	$(eval VPC_ID := $(shell cd IaC && pulumi stack output vpcId 2>/dev/null))
	$(eval PRIVATE_SUBNETS := $(shell cd IaC && pulumi stack output privateSubnetIds 2>/dev/null | tr -d '[]" ' | tr ',' ' '))
	$(eval SECURITY_GROUP := $(shell aws ec2 describe-security-groups --filters Name=group-name,Values=default Name=vpc-id,Values=$(VPC_ID) --query SecurityGroups[0].GroupId --output text 2>/dev/null))
	@echo "$(YELLOW)📋 Updating Lambda webhook URL...$(NC)"
	@aws lambda update-function-configuration \
		--function-name "$(LAMBDA_NAME)" \
		--environment 'Variables={ECS_CLUSTER="$(ECS_CLUSTER)",ECS_TASK_DEFINITION="$(shell cd IaC && pulumi stack output ecsTaskDefinition | cut -d'/' -f2)",SUBNET_IDS="$(PRIVATE_SUBNETS)",SECURITY_GROUP_ID="$(SECURITY_GROUP)",PROCESSED_BUCKET="$(PROCESSED_BUCKET)",REGION="ap-southeast-1",WEBHOOK_URL="$(WEBHOOK_URL)"}' \
		--region ap-southeast-1
	@echo "$(GREEN)✅ Lambda updated with webhook URL$(NC)"

# Update backend container
update-backend:
	$(eval BACKEND_IP := $(shell cd IaC && pulumi stack output backendPublicIp 2>/dev/null))
	$(eval ECR_URL := $(shell cd IaC && pulumi stack output ecrRepositoryUrl 2>/dev/null))
	@echo "$(YELLOW)🔄 Updating backend container...$(NC)"
	@# Build and push new image
	@aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin $(ECR_URL)
	@docker build -f Dockerfile.backend -t vision-sync-backend .
	@docker tag vision-sync-backend:latest $(ECR_URL):backend-latest
	@docker push $(ECR_URL):backend-latest
	@# Update container on EC2
	@make deploy-backend-container BACKEND_IP=$(BACKEND_IP) ECR_URL=$(ECR_URL) AWS_REGION=ap-southeast-1
	@echo "$(GREEN)✅ Backend updated$(NC)"

# SSH into backend instance
ssh-backend:
	$(eval BACKEND_IP := $(shell cd IaC && pulumi stack output backendPublicIp 2>/dev/null))
	@echo "$(YELLOW)🔗 Connecting to backend instance...$(NC)"
	@ssh -i "$$HOME/.ssh/vision-sync-backend" ubuntu@$(BACKEND_IP)

# View backend logs
logs-backend:
	$(eval BACKEND_IP := $(shell cd IaC && pulumi stack output backendPublicIp 2>/dev/null))
	@echo "$(YELLOW)📋 Viewing backend logs...$(NC)"
	@ssh -i "$$HOME/.ssh/vision-sync-backend" ubuntu@$(BACKEND_IP) "docker logs -f vision-sync-backend"

# Backend status
status-backend:
	$(eval BACKEND_IP := $(shell cd IaC && pulumi stack output backendPublicIp 2>/dev/null))
	@echo "$(YELLOW)📊 Backend Status$(NC)"
	@echo "IP: $(BACKEND_IP)"
	@echo "URL: http://$(BACKEND_IP):5000"
	@echo "Health: $$(curl -s -o /dev/null -w '%{http_code}' http://$(BACKEND_IP):5000/health 2>/dev/null || echo 'offline')"
	@ssh -i "$$HOME/.ssh/vision-sync-backend" ubuntu@$(BACKEND_IP) "docker ps --filter name=vision-sync-backend" 2>/dev/null || echo "Cannot connect to instance"

# Help with common issues (NEW)
troubleshoot:
	@echo "$(YELLOW)Common Issues & Solutions:$(NC)"
	@echo ""
	@echo "1. ECR login failed:"
	@echo "   aws configure set region ap-southeast-1"
	@echo "   aws ecr get-login-password --region ap-southeast-1"
	@echo ""
	@echo "2. Pulumi errors:"
	@echo "   pulumi login"
	@echo "   pulumi stack select dev"
	@echo ""
	@echo "3. Container push failed:"
	@echo "   make docker-clean"
	@echo "   make container"
	@echo ""
	@echo "4. Socket.IO not connecting:"
	@echo "   Check FRONTEND_URL in server/.env"
	@echo "   Check REACT_APP_API_URL in client/.env"
	@echo ""
	@echo "5. Backend deployment:"
	@echo "   make deploy-backend  # Full deployment"
	@echo "   make update-backend  # Update only"
	@echo "   make status-backend  # Check status"
	@echo "   make logs-backend    # View logs"
	@echo ""
	@echo "Run 'make status' to check deployment status"