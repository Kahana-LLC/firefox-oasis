interface TranscriptionUsage {
  timestamp: number;
  duration?: number; // audio duration in seconds
  transcriptLength?: number; // characters in transcript
  provider: 'deepgram' | 'gemini';
  cost?: number; // estimated cost in USD
  error?: string; // if transcription failed
}

interface UsageStats {
  dailyCount: number;
  monthlyCount: number;
  dailyCost: number;
  monthlyCost: number;
  lastReset: number; // timestamp of last daily reset
  lastMonthlyReset: number; // timestamp of last monthly reset
}

export class UsageTracker {
  private static instance: UsageTracker;
  private readonly STORAGE_KEY = 'oasis_transcription_usage';
  private readonly STATS_KEY = 'oasis_usage_stats';

  private _localStorageAvailable: boolean | null = null;

  private isLocalStorageAvailable(): boolean {
    if (this._localStorageAvailable !== null) {
      return this._localStorageAvailable;
    }
    try {
      const testKey = '__oasis_storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      this._localStorageAvailable = true;
    } catch {
      this._localStorageAvailable = false;
    }
    return this._localStorageAvailable;
  }

  // Cost rates (per provider)
  private readonly COST_RATES = {
    deepgram: {
      perMinute: 0.0043, // $0.0043 per minute
      perCharacter: 0 // Deepgram charges per minute, not per character
    },
    gemini: {
      perMinute: 0, // Gemini doesn't charge per minute
      perCharacter: 0.00025 // $0.00025 per 1000 characters
    }
  };

  // Usage limits - Updated for $20/month plan with 80% margins ($3 budget)
  private readonly LIMITS = {
    dailyTranscriptions: 2000,    // 60,000/month ÷ 30 days
    monthlyTranscriptions: 60000, // Based on $3 budget at $0.00005/text command
    dailyCost: 1.0,               // $1.00 per day (conservative)
    monthlyCost: 3.0              // $3.00 per month (80% margin on $20 plan)
  };

  // Burst rate limiting to prevent abuse
  private readonly BURST_LIMITS = {
    maxPerMinute: 10,       // Max 10 commands per minute
    maxPerHour: 100,        // Max 100 commands per hour
    minCooldownMs: 2000     // 2 second minimum cooldown between commands
  };

  // Progressive delays for consecutive usage (discourage spam)
  private readonly PROGRESSIVE_DELAYS = [0, 1000, 3000, 5000, 10000, 30000]; // ms

  // Burst tracking
  private burstTimestamps: number[] = [];
  private consecutiveCount = 0;
  private lastCommandTime = 0;

  private constructor() {}

  static getInstance(): UsageTracker {
    if (!UsageTracker.instance) {
      UsageTracker.instance = new UsageTracker();
    }
    return UsageTracker.instance;
  }

  // Record a transcription usage
  recordTranscription(usage: Omit<TranscriptionUsage, 'timestamp'>): void {
    const fullUsage: TranscriptionUsage = {
      ...usage,
      timestamp: Date.now(),
      cost: this.calculateCost(usage)
    };

    // Store individual usage record
    const usages = this.getStoredUsages();
    usages.push(fullUsage);

    // Keep only last 1000 records to prevent storage bloat
    if (usages.length > 1000) {
      usages.splice(0, usages.length - 1000);
    }

    if (this.isLocalStorageAvailable()) {
      localStorage!.setItem(this.STORAGE_KEY, JSON.stringify(usages));
    }

    // Update stats
    this.updateStats(fullUsage);

    console.log(`[UsageTracker] Recorded transcription: ${usage.provider}, cost: $${fullUsage.cost?.toFixed(4)}`);
  }

  // Record a transcription error
  recordTranscriptionError(provider: 'deepgram' | 'gemini', error: string): void {
    this.recordTranscription({
      provider,
      error,
      cost: 0
    });
  }

  // Get current usage stats
  getStats(): UsageStats {
    const stored = this.isLocalStorageAvailable() ? localStorage!.getItem(this.STATS_KEY) : null;
    if (!stored) {
      return this.createDefaultStats();
    }

    const stats: UsageStats = JSON.parse(stored);
    const now = Date.now();

    // Check if we need to reset counters
    const daysSinceReset = Math.floor((now - stats.lastReset) / (1000 * 60 * 60 * 24));
    const monthsSinceReset = Math.floor((now - stats.lastMonthlyReset) / (1000 * 60 * 60 * 24 * 30));

    if (daysSinceReset > 0) {
      stats.dailyCount = 0;
      stats.dailyCost = 0;
      stats.lastReset = now;
    }

    if (monthsSinceReset > 0) {
      stats.monthlyCount = 0;
      stats.monthlyCost = 0;
      stats.lastMonthlyReset = now;
    }

    // Save updated stats
    if (this.isLocalStorageAvailable()) {
      localStorage!.setItem(this.STATS_KEY, JSON.stringify(stats));
    }

    return stats;
  }

  // Check if user is approaching or has exceeded limits
  checkLimits(): {
    canTranscribe: boolean;
    warnings: string[];
    limits: {
      dailyCount: number;
      monthlyCount: number;
      dailyCost: number;
      monthlyCost: number;
    };
  } {
    const stats = this.getStats();
    const warnings: string[] = [];

    // Check daily limits
    if (stats.dailyCount >= this.LIMITS.dailyTranscriptions * 0.8) {
      warnings.push(`Approaching daily transcription limit: ${stats.dailyCount}/${this.LIMITS.dailyTranscriptions}`);
    }
    if (stats.dailyCost >= this.LIMITS.dailyCost * 0.8) {
      warnings.push(`Approaching daily cost limit: $${stats.dailyCost.toFixed(2)}/$${this.LIMITS.dailyCost}`);
    }

    // Check monthly limits
    if (stats.monthlyCount >= this.LIMITS.monthlyTranscriptions * 0.8) {
      warnings.push(`Approaching monthly transcription limit: ${stats.monthlyCount}/${this.LIMITS.monthlyTranscriptions}`);
    }
    if (stats.monthlyCost >= this.LIMITS.monthlyCost * 0.8) {
      warnings.push(`Approaching monthly cost limit: $${stats.monthlyCost.toFixed(2)}/$${this.LIMITS.monthlyCost}`);
    }

    const canTranscribe = stats.dailyCount < this.LIMITS.dailyTranscriptions &&
                         stats.monthlyCount < this.LIMITS.monthlyTranscriptions &&
                         stats.dailyCost < this.LIMITS.dailyCost &&
                         stats.monthlyCost < this.LIMITS.monthlyCost;

    return {
      canTranscribe,
      warnings,
      limits: {
        dailyCount: Math.max(0, this.LIMITS.dailyTranscriptions - stats.dailyCount),
        monthlyCount: Math.max(0, this.LIMITS.monthlyTranscriptions - stats.monthlyCount),
        dailyCost: Math.max(0, this.LIMITS.dailyCost - stats.dailyCost),
        monthlyCost: Math.max(0, this.LIMITS.monthlyCost - stats.monthlyCost)
      }
    };
  }

  // Check burst rate limits to prevent abuse
  checkBurstLimits(): {
    allowed: boolean;
    waitTimeMs?: number;
    reason?: string;
  } {
    const now = Date.now();

    // Clean old timestamps (keep last hour)
    this.burstTimestamps = this.burstTimestamps.filter(
      ts => now - ts < 60 * 60 * 1000
    );

    // Check minimum cooldown between commands
    if (now - this.lastCommandTime < this.BURST_LIMITS.minCooldownMs) {
      const waitTime = this.BURST_LIMITS.minCooldownMs - (now - this.lastCommandTime);
      return {
        allowed: false,
        waitTimeMs: waitTime,
        reason: `Minimum cooldown: ${Math.ceil(waitTime/1000)}s between commands`
      };
    }

    // Check per-minute limit
    const recentMinute = this.burstTimestamps.filter(ts => now - ts < 60 * 1000);
    if (recentMinute.length >= this.BURST_LIMITS.maxPerMinute) {
      const oldestInMinute = Math.min(...recentMinute);
      const waitTime = 60 * 1000 - (now - oldestInMinute);
      return {
        allowed: false,
        waitTimeMs: waitTime,
        reason: `Rate limited: ${this.BURST_LIMITS.maxPerMinute} commands per minute`
      };
    }

    // Check per-hour limit
    if (this.burstTimestamps.length >= this.BURST_LIMITS.maxPerHour) {
      const oldestInHour = Math.min(...this.burstTimestamps);
      const waitTime = 60 * 60 * 1000 - (now - oldestInHour);
      return {
        allowed: false,
        waitTimeMs: waitTime,
        reason: `Rate limited: ${this.BURST_LIMITS.maxPerHour} commands per hour`
      };
    }

    return { allowed: true };
  }

  // Get progressive delay for consecutive usage (discourages spam)
  getProgressiveDelay(): number {
    const now = Date.now();
    const timeSinceLast = now - this.lastCommandTime;

    // Reset counter if enough time has passed
    if (timeSinceLast > 30000) { // 30 seconds
      this.consecutiveCount = 0;
    } else {
      this.consecutiveCount = Math.min(this.consecutiveCount + 1, this.PROGRESSIVE_DELAYS.length - 1);
    }

    return this.PROGRESSIVE_DELAYS[this.consecutiveCount] || 30000;
  }

  // Record a command usage (updates burst tracking)
  recordCommand(): void {
    const now = Date.now();
    this.burstTimestamps.push(now);
    this.lastCommandTime = now;

    // Keep only recent timestamps (last hour)
    this.burstTimestamps = this.burstTimestamps.filter(
      ts => now - ts < 60 * 60 * 1000
    );

    // Limit array size to prevent memory issues
    if (this.burstTimestamps.length > this.BURST_LIMITS.maxPerHour * 2) {
      this.burstTimestamps = this.burstTimestamps.slice(-this.BURST_LIMITS.maxPerHour);
    }
  }

  // Get recent usage history
  getRecentUsage(hours: number = 24): TranscriptionUsage[] {
    const usages = this.getStoredUsages();
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);

    return usages.filter(usage => usage.timestamp > cutoff);
  }

  // Clear all usage data (for testing or user request)
  clearUsage(): void {
    if (this.isLocalStorageAvailable()) {
      localStorage!.removeItem(this.STORAGE_KEY);
      localStorage!.removeItem(this.STATS_KEY);
    }
  }

  private calculateCost(usage: Omit<TranscriptionUsage, 'timestamp' | 'cost'>): number {
    const rates = this.COST_RATES[usage.provider];

    if (usage.provider === 'deepgram') {
      // Deepgram charges per minute
      const duration = usage.duration || 0;
      return (duration / 60) * rates.perMinute;
    } else if (usage.provider === 'gemini') {
      // Gemini charges per character
      const chars = usage.transcriptLength || 0;
      return (chars / 1000) * rates.perCharacter;
    }

    return 0;
  }

  private getStoredUsages(): TranscriptionUsage[] {
    const stored = this.isLocalStorageAvailable() ? localStorage!.getItem(this.STORAGE_KEY) : null;
    return stored ? JSON.parse(stored) : [];
  }

  private updateStats(usage: TranscriptionUsage): void {
    const stats = this.getStats();

    stats.dailyCount++;
    stats.monthlyCount++;
    stats.dailyCost += usage.cost || 0;
    stats.monthlyCost += usage.cost || 0;

    if (this.isLocalStorageAvailable()) {
      localStorage!.setItem(this.STATS_KEY, JSON.stringify(stats));
    }
  }

  private createDefaultStats(): UsageStats {
    const now = Date.now();
    return {
      dailyCount: 0,
      monthlyCount: 0,
      dailyCost: 0,
      monthlyCost: 0,
      lastReset: now,
      lastMonthlyReset: now
    };
  }
}

export default UsageTracker.getInstance();
