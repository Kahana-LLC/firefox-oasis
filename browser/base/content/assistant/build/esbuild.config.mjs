import esbuild from "esbuild";

const OASIS_API_BASE = "https://segvax3qd7tkhcckzrijydbz6m0cijdu.lambda-url.us-east-2.on.aws/";
const AWS_REGION = "us-east-2";
const COGNITO_IDENTITY_POOL_ID = "us-east-2:21ce1894-9a97-48ac-8741-b69f7eafea1c";

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
    "process.env.AWS_REGION": JSON.stringify(AWS_REGION),
    "process.env.COGNITO_IDENTITY_POOL_ID": JSON.stringify(COGNITO_IDENTITY_POOL_ID),
  },
});
