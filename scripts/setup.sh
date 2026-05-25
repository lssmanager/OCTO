#!/bin/bash
# OCTO Setup Script
set -e

echo "🐙 Setting up OCTO development environment..."

# Check prerequisites
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is required (>=20). Install from https://nodejs.org"
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo "❌ pnpm is required. Install with: npm install -g pnpm"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo "❌ Docker is required. Install from https://docker.com"
  exit 1
fi

# Copy env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example"
else
  echo "ℹ️  .env already exists, skipping copy"
fi

# Validate required secrets were changed from placeholders
required_secrets=(
  "POSTGRES_PASSWORD"
  "REDIS_PASSWORD"
  "QDRANT_API_KEY"
  "MINIO_ACCESS_KEY"
  "MINIO_SECRET_KEY"
)

for secret in "${required_secrets[@]}"; do
  value=$(grep -E "^${secret}=" .env | cut -d'=' -f2- || true)
  if [ -z "$value" ] || [[ "$value" == replace-with-strong-* ]]; then
    echo "❌ ${secret} must be set in .env with a strong value before startup"
    exit 1
  fi
done

# Install Node dependencies
echo "📦 Installing Node dependencies..."
pnpm install

# Start infrastructure
echo "🐳 Starting infrastructure (postgres, redis, qdrant, minio)..."
docker compose -f infra/compose/docker-compose.infra.yml up -d

echo ""
echo "✅ OCTO setup complete!"
echo ""
echo "Run 'pnpm dev' to start all services in development mode."
echo "API:            http://localhost:3001"
echo "Web:            http://localhost:3000"
echo "Runtime Worker: http://localhost:8001"
echo "MinIO Console:  http://localhost:9001"
echo ""
