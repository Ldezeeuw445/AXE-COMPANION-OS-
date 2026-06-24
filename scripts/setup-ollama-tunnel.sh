#!/bin/bash
# Ollama Cloudflare Tunnel Setup Script for AXE Companion
# Run this on the machine where Ollama is installed

set -e

DOMAIN=""
SUBDOMAIN="ollama"
TUNNEL_NAME="axe-ollama"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "  AXE Companion — Ollama Tunnel Setup"
echo "=========================================="
echo ""

# Check if running as root (we don't want that for cloudflared login)
if [ "$EUID" -eq 0 ]; then
   echo -e "${RED}Warning: Running as root. cloudflared login should run as your user.${NC}"
   echo "Consider running this script without sudo."
   echo ""
fi

# Check Ollama
if ! command -v ollama &> /dev/null; then
    echo -e "${RED}Ollama not found. Please install Ollama first:${NC}"
    echo "  curl -fsSL https://ollama.com/install.sh | sh"
    exit 1
fi

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${RED}Ollama is not running on localhost:11434${NC}"
    echo "Start it with: ollama serve"
    exit 1
fi

echo -e "${GREEN}✓ Ollama is running${NC}"

# Check cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo ""
    echo -e "${YELLOW}cloudflared not found. Installing...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install cloudflare/cloudflare/cloudflared
        else
            echo -e "${RED}Homebrew not found. Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/${NC}"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        ARCH=$(uname -m)
        if [ "$ARCH" = "x86_64" ]; then
            curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
            sudo dpkg -i /tmp/cloudflared.deb || sudo apt-get install -f -y
        elif [ "$ARCH" = "aarch64" ]; then
            curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
            sudo dpkg -i /tmp/cloudflared.deb || sudo apt-get install -f -y
        else
            echo -e "${RED}Unsupported architecture: $ARCH${NC}"
            exit 1
        fi
    else
        echo -e "${RED}Unsupported OS: $OSTYPE${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ cloudflared is installed${NC}"

# Get domain
read -p "Enter your Cloudflare-managed domain (e.g., yourdomain.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "${RED}Domain is required${NC}"
    exit 1
fi

read -p "Enter subdomain for Ollama [ollama]: " input_subdomain
SUBDOMAIN=${input_subdomain:-$SUBDOMAIN}

FULL_DOMAIN="$SUBDOMAIN.$DOMAIN"

# Check if already authenticated
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
    echo ""
    echo -e "${YELLOW}You need to authenticate cloudflared with your Cloudflare account.${NC}"
    echo "A browser window will open. Log in and authorize."
    echo ""
    read -p "Press Enter to continue..."
    cloudflared tunnel login
fi

# Create tunnel
echo ""
echo -e "${YELLOW}Creating tunnel: $TUNNEL_NAME${NC}"
TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1 || true)

# Extract tunnel ID
TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oP 'Created tunnel [a-z0-9-]+ with id \K[a-f0-9-]+' || echo "")

if [ -z "$TUNNEL_ID" ]; then
    # Try to get existing tunnel ID
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}' | head -1)
    if [ -z "$TUNNEL_ID" ]; then
        echo -e "${RED}Failed to create or find tunnel${NC}"
        echo "$TUNNEL_OUTPUT"
        exit 1
    fi
    echo -e "${YELLOW}Using existing tunnel: $TUNNEL_ID${NC}"
else
    echo -e "${GREEN}✓ Created tunnel: $TUNNEL_ID${NC}"
fi

# Create DNS route
echo ""
echo -e "${YELLOW}Creating DNS route: $FULL_DOMAIN → tunnel${NC}"
cloudflared tunnel route dns "$TUNNEL_NAME" "$FULL_DOMAIN" 2>&1 || true

# Find credentials file
CRED_FILE=$(find "$HOME/.cloudflared" -name "*.json" -newer "$HOME/.cloudflared/cert.pem" 2>/dev/null | head -1)
if [ -z "$CRED_FILE" ]; then
    # Try to find by tunnel ID
    CRED_FILE="$HOME/.cloudflared/$TUNNEL_ID.json"
fi

# Create config directory
CONFIG_DIR="$HOME/.cloudflared"
mkdir -p "$CONFIG_DIR"

# Write config
cat > "$CONFIG_DIR/config.yml" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: $FULL_DOMAIN
    service: http://localhost:11434
    originRequest:
      noTLSVerify: true
  - service: http_status:404
EOF

echo -e "${GREEN}✓ Config written to $CONFIG_DIR/config.yml${NC}"

# Test the tunnel
echo ""
echo -e "${YELLOW}Testing tunnel connection...${NC}"
echo "Starting tunnel for 10 seconds..."

# Start tunnel in background
cloudflared tunnel run "$TUNNEL_NAME" &
TUNNEL_PID=$!

# Wait for tunnel to be ready
sleep 5

# Test
echo ""
if curl -s -o /dev/null -w "%{http_code}" "https://$FULL_DOMAIN/api/tags" | grep -q "200"; then
    echo -e "${GREEN}✓ Tunnel is working!${NC}"
    echo -e "${GREEN}  URL: https://$FULL_DOMAIN${NC}"
else
    echo -e "${YELLOW}⚠ Tunnel may still be starting. Test manually:${NC}"
    echo "  curl https://$FULL_DOMAIN/api/tags"
fi

# Kill test tunnel
kill $TUNNEL_PID 2>/dev/null || true
sleep 1

# Install as service
echo ""
echo "=========================================="
echo "  Install as System Service"
echo "=========================================="
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - create launchd plist
    PLIST_PATH="$HOME/Library/LaunchAgents/com.cloudflare.cloudflared.axe-ollama.plist"
    
    cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudflare.cloudflared.axe-ollama</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which cloudflared)</string>
        <string>tunnel</string>
        <string>run</string>
        <string>$TUNNEL_NAME</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/cloudflared-axe-ollama.out</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cloudflared-axe-ollama.err</string>
</dict>
</plist>
EOF

    launchctl load "$PLIST_PATH" 2>/dev/null || true
    
    echo -e "${GREEN}✓ LaunchAgent installed${NC}"
    echo "  Path: $PLIST_PATH"
    echo ""
    echo "To start: launchctl start com.cloudflare.cloudflared.axe-ollama"
    echo "To stop:  launchctl stop com.cloudflare.cloudflared.axe-ollama"
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - systemd service
    SERVICE_FILE="/etc/systemd/system/cloudflared-axe-ollama.service"
    
    echo "Creating systemd service (requires sudo)..."
    sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Cloudflare Tunnel for AXE Companion Ollama
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=$(which cloudflared) tunnel run $TUNNEL_NAME
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable cloudflared-axe-ollama
    
    echo -e "${GREEN}✓ Systemd service installed${NC}"
    echo "  Path: $SERVICE_FILE"
    echo ""
    echo "To start: sudo systemctl start cloudflared-axe-ollama"
    echo "To stop:  sudo systemctl stop cloudflared-axe-ollama"
    echo "Status:  sudo systemctl status cloudflared-axe-ollama"
fi

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo -e "${GREEN}Tunnel URL: https://$FULL_DOMAIN${NC}"
echo ""
echo "Next steps:"
echo "  1. Start the tunnel (or reboot for auto-start)"
echo "  2. Set Vercel env var: OLLAMA_URL=https://$FULL_DOMAIN"
echo "  3. Set Vercel env var: OLLAMA_MODEL=llama3.1"
echo "  4. Redeploy AXE Companion"
echo ""
echo "Test the tunnel:"
echo "  curl https://$FULL_DOMAIN/api/tags"
echo ""
