#!/bin/bash

# Test script for AWS Lambda function
# Usage: ./test_lambda.sh <function_name> <test_name>
# Example: ./test_lambda.sh my-lambda-function transcribe

FUNCTION_NAME=$1
TEST_NAME=$2

if [ -z "$FUNCTION_NAME" ] || [ -z "$TEST_NAME" ]; then
    echo "Usage: $0 <function_name> <test_name>"
    echo ""
    echo "Available test names:"
    echo "  transcribe - Test transcription with Deepgram fallback to Gemini"
    echo "  transcribe_force_gemini - Test transcription forcing Gemini provider"
    echo "  route - Test routing functionality"
    echo "  route_simple - Test routing with simple options"
    echo "  chat - Test chat operation (returns 404)"
    echo "  invalid_operation - Test invalid operation"
    echo "  missing_audio - Test transcription without audio"
    echo "  missing_options - Test routing without options"
    exit 1
fi

# Check if test exists in the JSON file
if ! jq -e ".${TEST_NAME}" test_lambda_payloads.json > /dev/null 2>&1; then
    echo "Test '${TEST_NAME}' not found. Available tests:"
    jq -r 'keys[]' test_lambda_payloads.json
    exit 1
fi

echo "Testing Lambda function: $FUNCTION_NAME"
echo "Test: $TEST_NAME"
echo "Description: $(jq -r ".${TEST_NAME}.description" test_lambda_payloads.json)"
echo ""

# Set environment variables if specified
if jq -e ".${TEST_NAME}.environment" test_lambda_payloads.json > /dev/null 2>&1; then
    echo "Setting environment variables:"
    jq -r ".${TEST_NAME}.environment | to_entries[] | \"export \(.key)=\(.value)\"" test_lambda_payloads.json
    echo ""
fi

echo "Invoking Lambda..."
echo "Request payload:"
jq ".${TEST_NAME}.payload" test_lambda_payloads.json
echo ""

# Invoke the Lambda function
aws lambda invoke \
    --function-name "$FUNCTION_NAME" \
    --payload "$(jq ".${TEST_NAME}.payload" test_lambda_payloads.json)" \
    response.json \
    --cli-binary-format raw-in-base64

echo ""
echo "Response:"
cat response.json | jq '.'
echo ""
echo "Raw response saved to response.json"
