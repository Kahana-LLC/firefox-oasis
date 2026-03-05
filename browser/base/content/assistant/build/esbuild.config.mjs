import esbuild from "esbuild";
import dotenv from "dotenv";

dotenv.config({ path: ".env.defaults", quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      `Missing required env var ${name}. Set it in build/.env.defaults, build/.env.local, or shell env.`
    );
  }
  return value.trim();
}

const OASIS_ASSIST_URL = requireEnv("OASIS_ASSIST_URL");
const OASIS_TRANSCRIBE_URL = requireEnv("OASIS_TRANSCRIBE_URL");
const AWS_REGION = requireEnv("AWS_REGION");
const COGNITO_IDENTITY_POOL_ID = requireEnv("COGNITO_IDENTITY_POOL_ID");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");

await esbuild.build({
  entryPoints: ["./src/assistant.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  outfile: "../assistant.bundle.js",
  sourcemap: false,
  logLevel: "info",
  define: {
    "process.env.OASIS_ASSIST_URL": JSON.stringify(OASIS_ASSIST_URL),
    "process.env.OASIS_TRANSCRIBE_URL": JSON.stringify(OASIS_TRANSCRIBE_URL),
    "process.env.AWS_REGION": JSON.stringify(AWS_REGION),
    "process.env.COGNITO_IDENTITY_POOL_ID": JSON.stringify(COGNITO_IDENTITY_POOL_ID),
    "process.env.SUPABASE_URL": JSON.stringify(SUPABASE_URL),
    "process.env.SUPABASE_ANON_KEY": JSON.stringify(SUPABASE_ANON_KEY),
  },
});
