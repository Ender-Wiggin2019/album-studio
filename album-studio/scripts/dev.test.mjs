import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNpmInvocation } from "./dev.mjs";

describe("createNpmInvocation", () => {
  it("runs npm.cmd through ComSpec on Windows", () => {
    assert.deepEqual(
      createNpmInvocation(["run", "dev"], "win32", {
        ComSpec: "C:\\Windows\\cmd.exe",
      }),
      {
        command: "C:\\Windows\\cmd.exe",
        args: ["/d", "/s", "/c", "npm.cmd", "run", "dev"],
      },
    );
  });

  it("falls back to cmd.exe when Windows does not provide ComSpec", () => {
    assert.equal(createNpmInvocation([], "win32", {}).command, "cmd.exe");
  });

  it("accepts uppercase COMSPEC on Windows", () => {
    assert.equal(
      createNpmInvocation([], "win32", { COMSPEC: "C:\\Windows\\System32\\cmd.exe" })
        .command,
      "C:\\Windows\\System32\\cmd.exe",
    );
  });

  it("runs npm directly on macOS and Linux", () => {
    assert.deepEqual(createNpmInvocation(["install"], "darwin", {}), {
      command: "npm",
      args: ["install"],
    });
  });
});
