import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { PWA_START_URL } from "./cachePolicy";

const root = process.cwd();

function readJson(rel: string) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8")) as {
    name?: string;
    short_name?: string;
    start_url?: string;
    display?: string;
    theme_color?: string;
    background_color?: string;
    icons?: Array<{ src: string; sizes: string; type?: string; purpose?: string }>;
  };
}

describe("PWA manifest", () => {
  const manifest = readJson("public/manifest.json");

  it("names the app and opens standalone at /chat", () => {
    assert.equal(manifest.name, "AXE Companion");
    assert.equal(manifest.short_name, "AXE");
    assert.equal(manifest.start_url, PWA_START_URL);
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.theme_color, "#06070a");
    assert.equal(manifest.background_color, "#06070a");
  });

  it("ships any + maskable icons at 192 and 512", () => {
    const icons = manifest.icons ?? [];
    const has = (sizes: string, purpose: string) =>
      icons.some((icon) => icon.sizes === sizes && (icon.purpose ?? "").split(" ").includes(purpose));

    assert.equal(has("192x192", "any"), true);
    assert.equal(has("512x512", "any"), true);
    assert.equal(has("192x192", "maskable"), true);
    assert.equal(has("512x512", "maskable"), true);

    for (const icon of icons) {
      assert.equal(existsSync(resolve(root, "public", icon.src.replace(/^\//, "").split("?")[0])), true);
      assert.equal((icon.purpose ?? "").includes("any") && (icon.purpose ?? "").includes("maskable"), false);
    }
  });

  it("keeps the iOS apple-touch-icon on disk", () => {
    assert.equal(existsSync(resolve(root, "public/apple-touch-icon.png")), true);
  });
});
