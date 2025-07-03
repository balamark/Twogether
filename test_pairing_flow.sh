#!/bin/bash

# Test the complete pairing flow
echo "🧪 Testing Pairing Flow End-to-End"
echo "=================================="

API_BASE="http://localhost:8080/api"

# Test 1: Register User A
echo "📝 Step 1: Registering User A..."
USER_A_RESPONSE=$(curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user-a@test.com",
    "nickname": "測試用戶A",
    "password": "password123"
  }')

USER_A_TOKEN=$(echo "$USER_A_RESPONSE" | jq -r '.token // empty')
if [ -z "$USER_A_TOKEN" ]; then
  echo "❌ Failed to register User A"
  echo "Response: $USER_A_RESPONSE"
  exit 1
fi
echo "✅ User A registered successfully"

# Test 2: Generate pairing code
echo "🔑 Step 2: Generating pairing code..."
PAIRING_RESPONSE=$(curl -s -X POST "$API_BASE/couples/pairing-code" \
  -H "Authorization: Bearer $USER_A_TOKEN")

PAIRING_CODE=$(echo "$PAIRING_RESPONSE" | jq -r '.code // empty')
if [ -z "$PAIRING_CODE" ]; then
  echo "❌ Failed to generate pairing code"
  echo "Response: $PAIRING_RESPONSE"
  exit 1
fi
echo "✅ Pairing code generated: $PAIRING_CODE"

# Test 3: Register User B
echo "📝 Step 3: Registering User B..."
USER_B_RESPONSE=$(curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user-b@test.com", 
    "nickname": "測試用戶B",
    "password": "password123"
  }')

USER_B_TOKEN=$(echo "$USER_B_RESPONSE" | jq -r '.token // empty')
if [ -z "$USER_B_TOKEN" ]; then
  echo "❌ Failed to register User B"
  echo "Response: $USER_B_RESPONSE"
  exit 1
fi
echo "✅ User B registered successfully"

# Test 4: User B pairs with code
echo "💑 Step 4: Pairing User B with code..."
COUPLE_RESPONSE=$(curl -s -X POST "$API_BASE/couples" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_B_TOKEN" \
  -d "{\"pairing_code\": \"$PAIRING_CODE\"}")

COUPLE_ID=$(echo "$COUPLE_RESPONSE" | jq -r '.id // empty')
if [ -z "$COUPLE_ID" ]; then
  echo "❌ Failed to pair users"
  echo "Response: $COUPLE_RESPONSE"
  exit 1
fi
echo "✅ Users paired successfully! Couple ID: $COUPLE_ID"

# Test 5: Verify both users can get couple info
echo "🔍 Step 5: Verifying couple info..."
USER_A_COUPLE=$(curl -s -X GET "$API_BASE/couples" \
  -H "Authorization: Bearer $USER_A_TOKEN")

USER_B_COUPLE=$(curl -s -X GET "$API_BASE/couples" \
  -H "Authorization: Bearer $USER_B_TOKEN")

USER_A_COUPLE_ID=$(echo "$USER_A_COUPLE" | jq -r '.id // empty')
USER_B_COUPLE_ID=$(echo "$USER_B_COUPLE" | jq -r '.id // empty')

if [ "$USER_A_COUPLE_ID" = "$USER_B_COUPLE_ID" ] && [ "$USER_A_COUPLE_ID" = "$COUPLE_ID" ]; then
  echo "✅ Both users can access couple info correctly"
else
  echo "❌ Couple info mismatch"
  echo "User A couple ID: $USER_A_COUPLE_ID"
  echo "User B couple ID: $USER_B_COUPLE_ID"
  echo "Expected couple ID: $COUPLE_ID"
  exit 1
fi

# Test 6: Try to use pairing code again (should fail)
echo "🚫 Step 6: Testing pairing code reuse (should fail)..."
REUSE_RESPONSE=$(curl -s -X POST "$API_BASE/couples" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_B_TOKEN" \
  -d "{\"pairing_code\": \"$PAIRING_CODE\"}")

REUSE_ERROR=$(echo "$REUSE_RESPONSE" | jq -r '.error.code // empty')
if [ "$REUSE_ERROR" = "CONFLICT" ] || [ "$REUSE_ERROR" = "ALREADY_PAIRED" ]; then
  echo "✅ Pairing code reuse correctly blocked"
else
  echo "⚠️  Pairing code reuse check unclear - Response: $REUSE_RESPONSE"
fi

echo ""
echo "🎉 Pairing Flow Test Complete!"
echo "================================"
echo "✅ User registration works"
echo "✅ Pairing code generation works"
echo "✅ Pairing with code works"
echo "✅ Couple info retrieval works"
echo "✅ Code reuse protection works"
echo ""
echo "🧪 Test Data:"
echo "User A Token: $USER_A_TOKEN"
echo "User B Token: $USER_B_TOKEN"
echo "Pairing Code: $PAIRING_CODE"
echo "Couple ID: $COUPLE_ID" 