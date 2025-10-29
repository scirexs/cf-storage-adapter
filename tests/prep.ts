/// <reference lib="deno.ns" />
import * as esbuild from "esbuild";

let exitCode = 0;
try {
  await esbuild.build({
    entryPoints: ["./tests/worker.ts"],
    outfile: "./tests/worker.js",
    bundle: true,
    format: "esm",
    target: "esnext",
    platform: "browser",
    external: ["cloudflare:workers"],
  });
} catch (error) {
  console.log("Build failed:", error);
  exitCode = 1;
} finally {
  await esbuild.stop();
  if (exitCode) Deno.exit(exitCode);
}
