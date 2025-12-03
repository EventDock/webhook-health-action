#!/bin/bash

# Integration test for EventDock Webhook Health Action
#
# This script tests the full flow:
# 1. Calls the health endpoint
# 2. Parses the response
# 3. Verifies the output format
#
# Usage:
#   EVENTDOCK_API_KEY=your_jwt_token ./test/integration.sh
#
# To get a JWT token:
#   1. Go to https://dashboard.eventdock.app
#   2. Log in with your email
#   3. Open browser DevTools > Network tab
#   4. Find any API request and copy the Authorization header value

set -e

API_URL="${EVENTDOCK_API_URL:-https://api.eventdock.app}"
API_KEY="${EVENTDOCK_API_KEY}"

if [ -z "$API_KEY" ]; then
  echo "ERROR: EVENTDOCK_API_KEY is required"
  echo ""
  echo "Usage: EVENTDOCK_API_KEY=your_jwt_token ./test/integration.sh"
  echo ""
  echo "To get a JWT token:"
  echo "  1. Go to https://dashboard.eventdock.app"
  echo "  2. Log in with your email"
  echo "  3. Open browser DevTools > Application > Local Storage"
  echo "  4. Copy the 'token' value"
  exit 1
fi

echo "========================================"
echo "EventDock Webhook Health Action - Integration Test"
echo "========================================"
echo ""
echo "API URL: $API_URL"
echo ""

# Test 1: Health endpoint returns valid JSON
echo "Test 1: Health endpoint returns valid JSON..."
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/v1/health" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "FAILED: Expected HTTP 200, got $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

echo "  HTTP Status: $HTTP_CODE"

# Test 2: Response has required fields
echo ""
echo "Test 2: Response has required fields..."
REQUIRED_FIELDS="total_events delivered_events failed_events dlq_count success_rate endpoints_count"

for field in $REQUIRED_FIELDS; do
  if ! echo "$BODY" | jq -e ".$field" > /dev/null 2>&1; then
    echo "FAILED: Missing required field: $field"
    exit 1
  fi
  VALUE=$(echo "$BODY" | jq -r ".$field")
  echo "  $field: $VALUE"
done

# Test 3: Endpoints array exists
echo ""
echo "Test 3: Endpoints array exists..."
ENDPOINTS_COUNT=$(echo "$BODY" | jq '.endpoints | length')
echo "  Endpoints count: $ENDPOINTS_COUNT"

if [ "$ENDPOINTS_COUNT" -gt 0 ]; then
  echo "  First endpoint:"
  echo "$BODY" | jq '.endpoints[0]' | sed 's/^/    /'
fi

# Test 4: Period object exists
echo ""
echo "Test 4: Period object exists..."
PERIOD_START=$(echo "$BODY" | jq -r '.period.start')
PERIOD_END=$(echo "$BODY" | jq -r '.period.end')
echo "  Start: $PERIOD_START"
echo "  End: $PERIOD_END"

# Calculate health status
echo ""
echo "========================================"
echo "Health Status Calculation"
echo "========================================"
SUCCESS_RATE=$(echo "$BODY" | jq -r '.success_rate')
DLQ_COUNT=$(echo "$BODY" | jq -r '.dlq_count')

# Determine status
if (( $(echo "$SUCCESS_RATE >= 99" | bc -l) )) && [ "$DLQ_COUNT" -eq 0 ]; then
  STATUS="healthy"
  EMOJI="✅"
elif (( $(echo "$SUCCESS_RATE >= 90" | bc -l) )); then
  STATUS="degraded"
  EMOJI="⚠️"
else
  STATUS="unhealthy"
  EMOJI="❌"
fi

echo ""
echo "$EMOJI Status: $STATUS"
echo "   Success Rate: $SUCCESS_RATE%"
echo "   DLQ Count: $DLQ_COUNT"

echo ""
echo "========================================"
echo "All tests passed!"
echo "========================================"
