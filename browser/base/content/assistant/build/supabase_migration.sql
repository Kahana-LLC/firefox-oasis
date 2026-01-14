-- Migration to create transcription usage tracking table
-- Run this in your Supabase SQL editor

-- Create transcription_usage table
CREATE TABLE IF NOT EXISTS transcription_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('deepgram', 'gemini')),
    duration_seconds REAL, -- audio duration in seconds
    transcript_length INTEGER, -- character count of transcript
    cost_usd REAL, -- estimated cost in USD
    error_message TEXT, -- error message if transcription failed
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Indexes for performance
    INDEX idx_transcription_usage_user_id (user_id),
    INDEX idx_transcription_usage_timestamp (timestamp),
    INDEX idx_transcription_usage_provider (provider)
);

-- Add RLS (Row Level Security) policies
ALTER TABLE transcription_usage ENABLE ROW LEVEL SECURITY;

-- Users can only see their own usage data
CREATE POLICY "Users can view own transcription usage" ON transcription_usage
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own usage data
CREATE POLICY "Users can insert own transcription usage" ON transcription_usage
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create a view for usage statistics
CREATE OR REPLACE VIEW user_transcription_stats AS
SELECT
    user_id,
    COUNT(*) as total_transcriptions,
    SUM(cost_usd) as total_cost_usd,
    AVG(cost_usd) as avg_cost_per_transcription,
    SUM(duration_seconds) as total_duration_seconds,
    AVG(duration_seconds) as avg_duration_seconds,
    MAX(timestamp) as last_transcription_at,
    -- Daily stats (last 24 hours)
    COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') as transcriptions_today,
    SUM(cost_usd) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') as cost_today,
    -- Monthly stats (last 30 days)
    COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '30 days') as transcriptions_this_month,
    SUM(cost_usd) FILTER (WHERE timestamp >= NOW() - INTERVAL '30 days') as cost_this_month
FROM transcription_usage
WHERE error_message IS NULL -- Only successful transcriptions
GROUP BY user_id;

-- Grant permissions
GRANT SELECT ON user_transcription_stats TO authenticated;
GRANT ALL ON transcription_usage TO authenticated;

-- Create a function to get usage stats for a user
CREATE OR REPLACE FUNCTION get_user_transcription_usage(user_uuid UUID DEFAULT auth.uid())
RETURNS TABLE (
    total_transcriptions BIGINT,
    total_cost_usd REAL,
    transcriptions_today BIGINT,
    cost_today REAL,
    transcriptions_this_month BIGINT,
    cost_this_month REAL,
    last_transcription_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(uts.total_transcriptions, 0)::BIGINT,
        COALESCE(uts.total_cost_usd, 0)::REAL,
        COALESCE(uts.transcriptions_today, 0)::BIGINT,
        COALESCE(uts.cost_today, 0)::REAL,
        COALESCE(uts.transcriptions_this_month, 0)::BIGINT,
        COALESCE(uts.cost_this_month, 0)::REAL,
        uts.last_transcription_at
    FROM user_transcription_stats uts
    WHERE uts.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
