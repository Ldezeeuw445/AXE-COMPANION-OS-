import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const src =
  "/Users/luka/.cursor/projects/Users-luka-Desktop-AXE-Assistent/assets/Logo_AXE_Companion_-a5f4acff-9345-4ac2-824a-58752b982bfb.png";
const out = "/Users/luka/Desktop/AXE Assistent/tradingos-companion/src/assets/axe-logo-base64.txt";

const buf = readFileSync(src);
const b64 = buf.toString("base64");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, b64, "utf8");
console.log("wrote", out, b64.length);

