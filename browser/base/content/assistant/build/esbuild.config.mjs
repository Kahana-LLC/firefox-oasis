import esbuild from "esbuild";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, ".env") });

const KEY  = (process.env.GOOGLE_API_KEY || "").trim();

if (!KEY) {
  console.error("[assistant] Missing GOOGLE_API_KEY (set it in build/.env)");
  process.exit(1);
}

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
    "process.env.GOOGLE_API_KEY": JSON.stringify(KEY),
  },
});
