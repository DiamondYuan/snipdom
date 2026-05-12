import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["iife"],
  outDir: "dist",
  target: "es2018",
  platform: "browser",
  minify: false,
  sourcemap: false,
  clean: true,
  splitting: false,
  treeshake: true,
  outExtension: () => ({ js: ".js" }),
});
