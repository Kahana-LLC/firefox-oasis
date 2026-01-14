// Test script for the enhanced Lambda function
// Usage: node test_lambda.js <test_name>

import { handler } from './enhanced_lambda_index.mjs';
import testPayloads from './test_lambda_payloads.json' assert { type: 'json' };

const testNames = Object.keys(testPayloads);

async function runTest(testName) {
  if (!testNames.includes(testName)) {
    console.error(`Available tests: ${testNames.join(', ')}`);
    return;
  }

  const testData = testPayloads[testName];
  console.log(`\n=== Running test: ${testName} ===`);
  console.log(`Description: ${testData.description}`);

  // Set environment variables if specified
  if (testData.environment) {
    Object.entries(testData.environment).forEach(([key, value]) => {
      process.env[key] = value;
      console.log(`Set ${key}=${value}`);
    });
  }

  // Create Lambda event
  const event = {
    requestContext: {
      http: {
        method: 'POST'
      }
    },
    body: JSON.stringify(testData.payload)
  };

  try {
    console.log('\n--- Request ---');
    console.log(JSON.stringify(testData.payload, null, 2));

    console.log('\n--- Response ---');
    const startTime = Date.now();
    const response = await handler(event);
    const duration = Date.now() - startTime;

    console.log(`Status: ${response.statusCode}`);
    console.log(`Duration: ${duration}ms`);
    console.log('Body:');
    console.log(JSON.stringify(JSON.parse(response.body), null, 2));

  } catch (error) {
    console.error('Test failed:', error);
  }

  // Clean up environment variables
  if (testData.environment) {
    Object.keys(testData.environment).forEach(key => {
      delete process.env[key];
    });
  }
}

// Run specific test or show usage
const testName = process.argv[2];
if (testName) {
  runTest(testName);
} else {
  console.log('Usage: node test_lambda.js <test_name>');
  console.log('Available tests:');
  testNames.forEach(name => {
    console.log(`  ${name}: ${testPayloads[name].description}`);
  });
}
