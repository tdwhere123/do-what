import { execSync } from "node:child_process";

execSync("pnpm --filter @different-ai/openwork build", { stdio: "inherit" });
