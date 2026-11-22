import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const files = [...new Set(
  execFileSync("git", [
    "ls-files", "--cached", "--others", "--exclude-standard", "-z"
  ], { encoding: "utf8" }).split("\0").filter(Boolean)
)];

const sensitiveNames =
  /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|id_rsa|id_ed25519)$|\.(pem|key|p12|pfx)$/i;

const patterns = [
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["github-token", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/],
  ["npm-token", /npm_[A-Za-z0-9]{30,}/],
  ["pypi-token", /pypi-[A-Za-z0-9_-]{24,}/],
  ["aws-key", /AKIA[0-9A-Z]{16}/],
  ["openai-key", /sk-proj-[A-Za-z0-9_-]{24,}/],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/-]{35,}\b/]
];

let findings = 0;

for (const file of files) {
  if (sensitiveNames.test(file)) {
    console.error(`BLOCKED sensitive filename: ${file}`);
    findings++;
    continue;
  }

  if (!statSync(file).isFile()) continue;

  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;

  const content = bytes.toString("utf8");

  for (const [type, pattern] of patterns) {
    if (pattern.test(content)) {
      console.error(`BLOCKED ${type}: ${file} [REDACTED]`);
      findings++;
    }
  }
}

console.log(`FILES CHECKED: ${files.length}`);
console.log(`FINDINGS: ${findings}`);

if (findings > 0) process.exitCode = 1;