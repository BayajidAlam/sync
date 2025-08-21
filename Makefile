# VisionSync Video Streaming Platform
.PHONY: help install build deploy container dev clean logs destroy

# Default target
help:
	@echo "VisionSync - Available commands:"
	@echo "  make install   - Install all dependencies"
	@echo "  make build     - Build all components"
	@echo "  make deploy    - Deploy infrastructure to AWS"
	@echo "  make container - Build and push Docker container"
	@echo "  make dev       - Start local development servers"
	@echo "  make env       - Show environment variables to set"
	@echo "  make logs      - View AWS logs"
	@echo "  make clean     - Clean build files"
	@echo "  make destroy   - Destroy AWS infrastructure"

# Install dependencies
install:
	@echo "Installing dependencies..."
	cd server && npm install
	cd client && npm install
	cd lambda && npm install
	cd container && npm install
	cd IaC && npm install

# Build all components
build:
	@echo "Building all components..."
	cd server && npm run build
	cd client && npm run build
	cd lambda && npm run build
	cd container && npm run build

# Deploy infrastructure
deploy:
	@echo "Deploying infrastructure..."
	cd IaC && pulumi up

# Build and push container to ECR
container: build
	@echo "Building and pushing container..."
	$(eval ECR_URL := $(shell cd IaC && pulumi stack output ecrRepositoryUrl))
	$(eval AWS_REGION := ap-southeast-1)
	@echo "ECR URL: $(ECR_URL)"
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_URL)
	cd container && docker build -t vision-sync-video-processor .
	docker tag vision-sync-video-processor:latest $(ECR_URL):latest
	docker push $(ECR_URL):latest

# Start development servers
dev:
	@echo "Starting development servers..."
	@echo "Backend will run on http://localhost:5000"
	@echo "Frontend will run on http://localhost:3000"
	@echo "Press Ctrl+C to stop"
	cd server && npm run dev &
	cd client && npm run dev

# Show environment variables to set
env:
	@echo "Copy these environment variables to server/.env:"
	@echo "=========================================="
	$(eval RAW_BUCKET := $(shell cd IaC && pulumi stack output rawVideosBucketName))
	$(eval PROCESSED_BUCKET := $(shell cd IaC && pulumi stack output processedVideosBucketName))
	$(eval SQS_URL := $(shell cd IaC && pulumi stack output videoProcessingQueueUrl))
	@echo "S3_BUCKET_RAW=$(RAW_BUCKET)"
	@echo "S3_BUCKET_PROCESSED=$(PROCESSED_BUCKET)"
	@echo "SQS_QUEUE_URL=$(SQS_URL)"
	@echo "AWS_REGION=ap-southeast-1"

# View logs
logs:
	@echo "Choose which logs to view:"
	@echo "1. Lambda logs: make logs-lambda"
	@echo "2. ECS logs: make logs-ecs"

logs-lambda:
	$(eval LAMBDA_NAME := $(shell cd IaC && pulumi stack output lambdaFunctionName))
	aws logs tail /aws/lambda/$(LAMBDA_NAME) --follow

logs-ecs:
	aws logs tail /ecs/vision-sync-video-processing-dev --follow

# Clean build files
clean:
	@echo "Cleaning build files..."
	rm -rf server/dist
	rm -rf client/dist
	rm -rf lambda/dist
	rm -rf container/dist
	rm -rf */node_modules/.cache

# Destroy AWS infrastructure
destroy:
	@echo "⚠️  This will destroy ALL AWS resources!"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ]
	cd IaC && pulumi destroy

# Complete setup (first time)
setup: install build deploy container env
	@echo "✅ Setup complete!"
	@echo "Next steps:"
	@echo "1. Copy the environment variables above to server/.env"
	@echo "2. Run 'make dev' to start development servers"

# Quick deploy (updates)
update: build container deploy
	@echo "✅ Update complete!"