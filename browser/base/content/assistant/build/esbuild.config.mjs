import esbuild from "esbuild";

const OASIS_API_BASE = "https://segvax3qd7tkhcckzrijydbz6m0cijdu.lambda-url.us-east-2.on.aws/";
const OASIS_TRANSCRIBE_URL = "https://uzfhm4tjnp7k5lpf2vkyqmrpxq0pxxed.lambda-url.us-east-2.on.aws/"; // Add your transcription lambda URL here
const AWS_REGION = "us-east-2";
const COGNITO_IDENTITY_POOL_ID = "us-east-2:21ce1894-9a97-48ac-8741-b69f7eafea1c";
const SUPABASE_URL = "https://wvclepquxxczgrukfqyr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y2xlcHF1eHhjemdydWtmcXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwODU5OTksImV4cCI6MjA3MDY2MTk5OX0.T-hZ_8QxtVnOt0mtCY_Zch87SYEcsyQZwnvvFAtZiNY";

await esbuild.build({
  entryPoints: ["./src/assistant.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  outfile: "../assistant.bundle.js",
  sourcemap: false,
  logLevel: "info",
  define: {
    "process.env.OASIS_API_BASE": JSON.stringify(OASIS_API_BASE),
    "process.env.OASIS_TRANSCRIBE_URL": JSON.stringify(OASIS_TRANSCRIBE_URL),
    "process.env.AWS_REGION": JSON.stringify(AWS_REGION),
    "process.env.COGNITO_IDENTITY_POOL_ID": JSON.stringify(COGNITO_IDENTITY_POOL_ID),
    "process.env.SUPABASE_URL": JSON.stringify(SUPABASE_URL),
    "process.env.SUPABASE_ANON_KEY": JSON.stringify(SUPABASE_ANON_KEY),
  },
});
