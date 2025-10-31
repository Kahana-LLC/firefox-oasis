// Environment configuration for Supabase
export const ENV = {
    // Supabase configuration - using build-time environment variables
    SUPABASE_URL: process.env.SUPABASE_URL || 'https://wvclepquxxczgrukfqyr.supabase.co',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y2xlcHF1eHhjemdydWtmcXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwODU5OTksImV4cCI6MjA3MDY2MTk5OX0.T-hZ_8QxtVnOt0mtCY_Zch87SYEcsyQZwnvvFAtZiNY',
    
    // Application configuration
    APP_VERSION: '1.0.0',
    LOG_LEVEL: 'info',
    
    // Validate environment variables
    validate(): void {
        if (!this.SUPABASE_URL) {
            throw new Error('SUPABASE_URL is required');
        }
        if (!this.SUPABASE_ANON_KEY) {
            throw new Error('SUPABASE_ANON_KEY is required');
        }
    }
};

