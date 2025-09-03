#!/usr/bin/env bash
# exit on error
set -o errexit

echo "🚀 Starting build process..."

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "📦 Installing dependencies from requirements.txt..."
pip install -r src/requirements.txt

# Verify critical packages
echo "✅ Verifying installation..."
python -c "import fastapi, uvicorn, sqlalchemy, asyncpg; print('✅ All critical packages installed successfully')"

echo "🎉 Build completed successfully!"
