import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const forbidden = /BUILT_IN_FORGE_API_KEY|DATABASE_URL|JWT_SECRET|OAUTH_SERVER_URL/;
const ignored = new Set(["node_modules", ".git", "dist", ".manus-logs"]);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (ignored.has(entry)) continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const trackedEnv = execFileSync("git", ["ls-files", "*.env", ".env", ".env.*"], { encoding: "utf8" }).trim();
if (trackedEnv) throw new Error(`Tracked environment file detected: ${trackedEnv}`);

const clientFiles = walk(join(root, "client")).filter(file => /\.(tsx?|jsx?|css|html)$/.test(file));
const leaks = clientFiles.filter(file => forbidden.test(readFileSync(file, "utf8")));
if (leaks.length) throw new Error(`Server-only secret reference found in client: ${leaks.map(file => relative(root, file)).join(", ")}`);

execFileSync("git", ["diff", "--check"], { stdio: "inherit" });
console.log("Veyra security checks passed: no tracked env files, no server-only secret references in client, and clean diff whitespace.");
