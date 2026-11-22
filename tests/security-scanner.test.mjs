import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const scanner = fileURLToPath(
  new URL("../scripts/check-public-secrets.mjs", import.meta.url)
);

function verifyBlocked(filename, content, expected) {
  const dir = mkdtempSync(join(tmpdir(), "voipano-security-"));

  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, filename), content);

    const result = spawnSync(process.execPath, [scanner], {
      cwd: dir,
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("rejects npm and PyPI credential backup filenames", () => {
  verifyBlocked(".npmrc.backup", "test fixture", /sensitive filename/);
  verifyBlocked(".pypirc.old", "test fixture", /sensitive filename/);
});

test("detects a fake token inside NUL-containing files", () => {
  const fakeToken = "npm_" + "Z".repeat(36);

  verifyBlocked(
    "fixture.bin",
    Buffer.from("prefix\0" + fakeToken),
    /npm-token/
  );
});