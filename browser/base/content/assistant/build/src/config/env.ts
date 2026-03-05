// Environment configuration for Supabase
export const ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  APP_VERSION: "1.0.0",
  LOG_LEVEL: "info",
  validate(): void {
    if (!this.SUPABASE_URL) {
      throw new Error("SUPABASE_URL is required");
    }
    if (!this.SUPABASE_ANON_KEY) {
      throw new Error("SUPABASE_ANON_KEY is required");
    }
  },
};
