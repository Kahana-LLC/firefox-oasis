import esbuild from "esbuild";
import path from "node:path";

const OASIS_API_BASE = "https://segvax3qd7tkhcckzrijydbz6m0cijdu.lambda-url.us-east-2.on.aws/";
const OASIS_CLIENT_TOKEN = "geminiclienttoken"

await esbuild.build({
  entryPoints: ["./src/assistant.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  outfile: "../assistant.bundle.js",
  sourcemap: false,
  logLevel: "warning",
  define: {
    "process.env.OASIS_API_BASE": JSON.stringify(OASIS_API_BASE),
    "process.env.OASIS_CLIENT_TOKEN": JSON.stringify(OASIS_CLIENT_TOKEN),
  },
});
