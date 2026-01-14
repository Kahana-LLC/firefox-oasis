import SupabaseAuth from './supabase';

interface TranscriptionLog {
  provider: 'deepgram' | 'gemini';
  duration_seconds?: number;
  transcript_length?: number;
  cost_usd?: number;
  error_message?: string;
}

export class UsageLogger {
  private static instance: UsageLogger;
  private supabaseAuth = SupabaseAuth.getInstance();

  static getInstance(): UsageLogger {
    if (!UsageLogger.instance) {
      UsageLogger.instance = new UsageLogger();
    }
    return UsageLogger.instance;
  }

  // Log a transcription usage to Supabase
  async logTranscription(logData: TranscriptionLog): Promise<void> {
    try {
      const isAuthenticated = await this.supabaseAuth.isAuthenticated();
      if (!isAuthenticated) {
        console.warn('[UsageLogger] User not authenticated, skipping usage log');
        return;
      }

      const session = await this.supabaseAuth.getSession();
      if (!session?.user?.id) {
        console.warn('[UsageLogger] No user ID available, skipping usage log');
        return;
      }

      const supabase = this.supabaseAuth.getSupabaseClient();
      if (!supabase) {
        console.warn('[UsageLogger] Supabase client not available, skipping usage log');
        return;
      }

      const { error } = await supabase
        .from('transcription_usage')
        .insert({
          user_id: session.user.id,
          provider: logData.provider,
          duration_seconds: logData.duration_seconds,
          transcript_length: logData.transcript_length,
          cost_usd: logData.cost_usd,
          error_message: logData.error_message
        });

      if (error) {
        console.error('[UsageLogger] Failed to log transcription usage:', error);
      } else {
        console.log('[UsageLogger] Successfully logged transcription usage');
      }
    } catch (error) {
      console.error('[UsageLogger] Error logging transcription usage:', error);
    }
  }

  // Get usage statistics for the current user
  async getUsageStats(): Promise<{
    total_transcriptions: number;
    total_cost_usd: number;
    transcriptions_today: number;
    cost_today: number;
    transcriptions_this_month: number;
    cost_this_month: number;
    last_transcription_at: string | null;
  } | null> {
    try {
      const isAuthenticated = await this.supabaseAuth.isAuthenticated();
      if (!isAuthenticated) {
        return null;
      }

      const supabase = this.supabaseAuth.getSupabaseClient();
      if (!supabase) {
        return null;
      }

      const { data, error } = await supabase
        .rpc('get_user_transcription_usage');

      if (error) {
        console.error('[UsageLogger] Failed to get usage stats:', error);
        return null;
      }

      return data?.[0] || {
        total_transcriptions: 0,
        total_cost_usd: 0,
        transcriptions_today: 0,
        cost_today: 0,
        transcriptions_this_month: 0,
        cost_this_month: 0,
        last_transcription_at: null
      };
    } catch (error) {
      console.error('[UsageLogger] Error getting usage stats:', error);
      return null;
    }
  }

  // Check if user is approaching limits based on Supabase data
  async checkLimits(): Promise<{
    canTranscribe: boolean;
    warnings: string[];
    limits: {
      dailyCount: number;
      monthlyCount: number;
      dailyCost: number;
      monthlyCost: number;
    };
  }> {
    const LIMITS = {
      dailyTranscriptions: 50,
      monthlyTranscriptions: 1000,
      dailyCost: 1.0, // $1.00 per day
      monthlyCost: 20.0 // $20.00 per month
    };

    const stats = await this.getUsageStats();
    if (!stats) {
      // If we can't get stats, allow transcription but show warning
      return {
        canTranscribe: true,
        warnings: ['Unable to verify usage limits - proceeding with caution'],
        limits: {
          dailyCount: LIMITS.dailyTranscriptions,
          monthlyCount: LIMITS.monthlyTranscriptions,
          dailyCost: LIMITS.dailyCost,
          monthlyCost: LIMITS.monthlyCost
        }
      };
    }

    const warnings: string[] = [];

    // Check daily limits
    if (stats.transcriptions_today >= LIMITS.dailyTranscriptions * 0.8) {
      warnings.push(`Approaching daily transcription limit: ${stats.transcriptions_today}/${LIMITS.dailyTranscriptions}`);
    }
    if (stats.cost_today >= LIMITS.dailyCost * 0.8) {
      warnings.push(`Approaching daily cost limit: $${stats.cost_today.toFixed(2)}/$${LIMITS.dailyCost}`);
    }

    // Check monthly limits
    if (stats.transcriptions_this_month >= LIMITS.monthlyTranscriptions * 0.8) {
      warnings.push(`Approaching monthly transcription limit: ${stats.transcriptions_this_month}/${LIMITS.monthlyTranscriptions}`);
    }
    if (stats.cost_this_month >= LIMITS.monthlyCost * 0.8) {
      warnings.push(`Approaching monthly cost limit: $${stats.cost_this_month.toFixed(2)}/$${LIMITS.monthlyCost}`);
    }

    const canTranscribe = stats.transcriptions_today < LIMITS.dailyTranscriptions &&
                         stats.transcriptions_this_month < LIMITS.monthlyTranscriptions &&
                         stats.cost_today < LIMITS.dailyCost &&
                         stats.cost_this_month < LIMITS.monthlyCost;

    return {
      canTranscribe,
      warnings,
      limits: {
        dailyCount: Math.max(0, LIMITS.dailyTranscriptions - stats.transcriptions_today),
        monthlyCount: Math.max(0, LIMITS.monthlyTranscriptions - stats.transcriptions_this_month),
        dailyCost: Math.max(0, LIMITS.dailyCost - stats.cost_today),
        monthlyCost: Math.max(0, LIMITS.monthlyCost - stats.cost_this_month)
      }
    };
  }
}

export default UsageLogger.getInstance();
