#!/bin/bash
# Start all agents and connectors for the multi-agent automation system

echo "Starting Multi-Agent Automation System..."
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Start each service in the background
echo -e "${BLUE}Starting Business Context Agent (port 3100)...${NC}"
npx ts-node-dev --respawn --transpile-only businessContextAgent.ts &

echo -e "${BLUE}Starting Google Calendar Connector (port 3000)...${NC}"
npx ts-node-dev --respawn --transpile-only googleCalendarConnector.ts &

echo -e "${BLUE}Starting Intake Agent (port 3300)...${NC}"
npx ts-node-dev --respawn --transpile-only intakeAgent.ts &

echo -e "${BLUE}Starting Automation Agent (port 3200)...${NC}"
npx ts-node-dev --respawn --transpile-only automationAgent.ts &

echo -e "${BLUE}Starting Invoice Agent (port 3400)...${NC}"
npx ts-node-dev --respawn --transpile-only invoiceAgent.ts &

echo -e "${BLUE}Starting Stripe Connector (port 3500)...${NC}"
npx ts-node-dev --respawn --transpile-only stripeConnector.ts &

echo -e "${BLUE}Starting Payment Agent (port 3600)...${NC}"
npx ts-node-dev --respawn --transpile-only paymentAgent.ts &

echo -e "${BLUE}Starting Tax Agent (port 3700)...${NC}"
npx ts-node-dev --respawn --transpile-only taxAgent.ts &

echo -e "${BLUE}Starting Twilio Connector (port 3800)...${NC}"
npx ts-node-dev --respawn --transpile-only twilioConnector.ts &

echo ""
echo -e "${GREEN}All services started in background.${NC}"
echo -e "${BLUE}Monitor logs above. Press Ctrl+C to stop all services.${NC}"
echo ""
echo "Available endpoints:"
echo "  - Business Context Agent: http://localhost:3100"
echo "  - Google Calendar: http://localhost:3000"
echo "  - Intake Agent: http://localhost:3300"
echo "  - Automation Agent: http://localhost:3200"
echo "  - Invoice Agent: http://localhost:3400"
echo "  - Stripe Connector: http://localhost:3500"
echo "  - Payment Agent: http://localhost:3600"
echo "  - Tax Agent: http://localhost:3700"
echo "  - Twilio Connector: http://localhost:3800"
echo ""

wait
