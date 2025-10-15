// Environment configuration for Supabase
// IMPORTANT: Replace these placeholder values with your actual Supabase credentials
// DO NOT commit real credentials to version control!

export const ENV = {
    // Supabase configuration - REPLACE WITH YOUR ACTUAL VALUES
    SUPABASE_URL: process.env.SUPABASE_URL || 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'your-anon-key-here',
    
    // Application configuration
    APP_VERSION: '1.0.0',
    LOG_LEVEL: 'info',
    
    // Validate environment variables
    validate(): void {
        if (!this.SUPABASE_URL || this.SUPABASE_URL.includes('your-project')) {
            throw new Error('SUPABASE_URL must be set to your actual Supabase project URL');
        }
        if (!this.SUPABASE_ANON_KEY || this.SUPABASE_ANON_KEY.includes('your-anon-key')) {
            throw new Error('SUPABASE_ANON_KEY must be set to your actual Supabase anon key');
        }
    }
};

