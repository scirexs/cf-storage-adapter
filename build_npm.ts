/// <reference lib="deno.ns" />
import { build, emptyDir } from "jsr:@deno/dnt";
import packageInfo from "./deno.json" with { type: "json" };

await emptyDir("./npm");

await build({
  entryPoints: ["./src/mod.ts"],
  outDir: "./npm",
  scriptModule: false,
  typeCheck: false,
  declaration: "separate",
  test: false,
  shims: {
    deno: false,
  },
  compilerOptions: {
    lib: ["ES2023"],
    target: "ES2023",
  },
  package: {
    name: "@scirexs/cf-storage-adapter",
    version: packageInfo.version,
    description: "An adapter for KVS, RDB, and Object Storage using Cloudflare services.",
    author: "scirexs",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/scirexs/cf-storage-adapter.git"
    },
    homepage: "https://github.com/scirexs/cf-storage-adapter#readme",
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});

const CFOBJ_PATH = "./npm/esm/cfobj.js";
const contents = await Deno.readTextFile(CFOBJ_PATH);
await Deno.writeTextFile(CFOBJ_PATH, contents.replace(
  `import { DurableObject } from "./types.js";`,
  `import { DurableObject } from "cloudflare:workers";`
));
