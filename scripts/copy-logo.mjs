import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const src =
  "/Users/luka/.cursor/projects/Users-luka-Desktop-AXE-Assistent/assets/Logo_AXE_Companion_-a5f4acff-9345-4ac2-824a-58752b982bfb.png";
const dst =
  "/Users/luka/Desktop/AXE Assistent/tradingos-companion/public/axe-logo-companion.png";

if (!existsSync(src)) {
  throw new Error(`Source logo missing: ${src}`);
}
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log("copied", dst);

