#!/bin/bash

echo "🎮 Tic-Tac-Toe Multiplayer Game - Setup Script"
echo "================================================"
echo ""

# Fix docker-compose.yml (remove obsolete version)
echo "📝 Updating docker-compose.yml..."
sed -i '/^version:/d' docker-compose.yml

# Start services
echo "🚀 Starting Nakama and PostgreSQL..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Start the Angular frontend:"
echo "      cd frontend && npm start"
echo ""
echo "   2. Open your browser to: http://localhost:4200"
echo ""
echo "   3. Nakama DevConsole available at: http://localhost:7351"
echo ""
echo "📖 See README.md for detailed instructions"
