# Voice Input Usage Tracking & Cost Monitoring

This document explains the comprehensive usage tracking system implemented for the Firefox Oasis Assistant voice input feature.

## Overview

The system tracks transcription usage across multiple layers to provide accurate cost monitoring, rate limiting, and user transparency. It prevents API abuse while giving users visibility into their usage and costs.

## Architecture

### 1. Frontend Tracking (`UsageTracker`)
- **Location**: `build/src/services/usageTracker.ts`
- **Purpose**: Fast, local usage tracking and limits checking
- **Storage**: localStorage (client-side)
- **Features**:
  - Request counting (daily/monthly)
  - Cost estimation
  - Rate limiting
  - Usage warnings

### 2. Database Logging (`UsageLogger`)
- **Location**: `build/src/services/usageLogger.ts`
- **Purpose**: Accurate, server-side usage logging
- **Storage**: Supabase database
- **Features**:
  - Persistent usage logs
  - Server-side rate limiting
  - Cost analytics
  - User-specific data

### 3. UI Integration
- **Location**: `assistant.ui.js`
- **Features**:
  - Usage stats button (📊)
  - Real-time warnings
  - Cost displays
  - Limit notifications

## Usage Limits

### Default Limits
```javascript
const LIMITS = {
  dailyTranscriptions: 50,      // 50 transcriptions per day
  monthlyTranscriptions: 1000,  // 1000 transcriptions per month
  dailyCost: 1.0,              // $1.00 per day
  monthlyCost: 20.0            // $20.00 per month
};
```

### Cost Rates
```javascript
const COST_RATES = {
  deepgram: {
    perMinute: 0.0043,    // $0.0043 per minute
    perCharacter: 0     // Not used for Deepgram
  },
  gemini: {
    perMinute: 0,        // Not charged per minute
    perCharacter: 0.00025 // $0.00025 per 1000 characters
  }
};
```

## How It Works

### 1. Before Recording Starts
```javascript
// Check local limits (fast)
const localLimits = usageTracker.checkLimits();

// Check server limits (accurate)
const serverLimits = await usageLogger.checkLimits();

// Block if either limit exceeded
if (!localLimits.canTranscribe || !serverLimits.canTranscribe) {
  throw new Error("Usage limit exceeded");
}
```

### 2. After Successful Transcription
```javascript
// Record in local storage
usageTracker.recordTranscription({
  provider: 'deepgram',
  duration: 2.5,
  transcriptLength: 150
});

// Log to Supabase (async)
usageLogger.logTranscription({
  provider: 'deepgram',
  duration_seconds: 2.5,
  transcript_length: 150,
  cost_usd: 0.0043
});
```

### 3. UI Updates
- Warnings shown when approaching 80% of limits
- Usage stats available via 📊 button
- Real-time cost estimates displayed

## Setup Instructions

### 1. Database Setup
Run the migration SQL in your Supabase SQL editor:
```sql
-- Execute: supabase_migration.sql
```

### 2. Lambda Enhancement
Update your AWS Lambda function to return usage metadata:
```json
{
  "transcript": "Hello world",
  "provider": "deepgram",
  "cost": 0.0043,
  "duration": 2.5
}
```
See `lambda_enhancement_guide.md` for detailed instructions.

### 3. Build & Deploy
```bash
cd browser/base/content/assistant/build
npm install
npm run build
```

## Testing the System

### 1. Basic Usage Tracking
1. Open Firefox with the assistant
2. Click the microphone button
3. Record and transcribe audio
4. Check browser console for usage logs

### 2. Usage Stats Display
1. Click the 📊 button next to the mic
2. View detailed usage statistics
3. Check warnings when approaching limits

### 3. Rate Limiting
1. Make multiple transcription requests
2. Observe warnings at 80% usage
3. See blocking at 100% usage

### 4. Cost Monitoring
1. Check localStorage for usage data
2. Query Supabase for server-side logs
3. Monitor actual API costs vs estimates

## API Reference

### UsageTracker Methods
```typescript
// Check if transcription is allowed
checkLimits(): { canTranscribe: boolean, warnings: string[], limits: object }

// Record a successful transcription
recordTranscription(data: {
  provider: 'deepgram' | 'gemini',
  duration?: number,
  transcriptLength?: number
}): void

// Record a failed transcription
recordTranscriptionError(provider: string, error: string): void

// Get usage statistics
getStats(): UsageStats

// Get recent usage history
getRecentUsage(hours: number): TranscriptionUsage[]

// Clear all usage data
clearUsage(): void
```

### UsageLogger Methods
```typescript
// Log transcription to database
logTranscription(data: TranscriptionLog): Promise<void>

// Get server-side usage stats
getUsageStats(): Promise<UsageStats | null>

// Check server-side limits
checkLimits(): Promise<LimitsCheck>
```

## Monitoring & Analytics

### Client-Side Monitoring
- Open browser DevTools → Application → Local Storage
- Look for keys: `oasis_transcription_usage`, `oasis_usage_stats`

### Server-Side Monitoring
```sql
-- Query usage by user
SELECT * FROM transcription_usage
WHERE user_id = 'user-uuid'
ORDER BY timestamp DESC;

-- Get usage summary
SELECT * FROM user_transcription_stats
WHERE user_id = 'user-uuid';
```

### Cost Analysis
```sql
-- Total costs by provider
SELECT
  provider,
  COUNT(*) as transcriptions,
  SUM(cost_usd) as total_cost,
  AVG(cost_usd) as avg_cost
FROM transcription_usage
WHERE error_message IS NULL
GROUP BY provider;
```

## Troubleshooting

### Common Issues

1. **"Usage limit exceeded" errors**
   - Check localStorage data
   - Verify Supabase connection
   - Clear usage data if needed: `usageTracker.clearUsage()`

2. **Missing usage stats**
   - Ensure Supabase table is created
   - Check RLS policies
   - Verify user authentication

3. **Inaccurate cost estimates**
   - Update Lambda to return real costs
   - Check cost rate constants
   - Verify audio duration calculation

### Debug Commands
```javascript
// In browser console
usageTracker.getStats()           // View local stats
usageTracker.checkLimits()        // Check current limits
usageTracker.clearUsage()         // Reset usage data

// Async server check
usageLogger.getUsageStats().then(console.log)
usageLogger.checkLimits().then(console.log)
```

## Future Enhancements

1. **Real-time Cost Dashboard**: Web-based usage dashboard
2. **Usage Alerts**: Email notifications for limit warnings
3. **Cost Optimization**: Automatic provider selection based on cost
4. **Usage Export**: CSV export of usage data
5. **Advanced Analytics**: Usage patterns and trends
6. **Billing Integration**: Stripe integration for paid tiers

## Security Considerations

- All usage data is scoped to authenticated users
- RLS policies prevent users from seeing others' data
- Local storage is client-side only (not secure)
- Server-side logs provide audit trail
- Rate limiting prevents API abuse

## Performance Impact

- **Local checks**: ~1ms (negligible)
- **Server checks**: ~100-500ms (network dependent)
- **Database logging**: Async (non-blocking)
- **Storage**: ~1KB per 100 transcriptions

The system is designed to be fast for normal usage while providing comprehensive monitoring for cost control.
