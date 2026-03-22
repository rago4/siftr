import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parseCliArgs } from "../core/args";

describe("parseCliArgs", () => {
  test("uses the current working directory by default", () => {
    const parsed = parseCliArgs([]);

    expect(parsed).toEqual({
      help: false,
      cwd: process.cwd(),
    });
  });

  test("accepts a single path argument", () => {
    const parsed = parseCliArgs(["fixtures/demo"]);

    expect(parsed.help).toBe(false);
    expect(parsed.cwd).toBe(path.resolve("fixtures/demo"));
  });

  test("shows help when requested", () => {
    expect(parseCliArgs(["--help"])).toEqual({
      help: true,
      cwd: process.cwd(),
    });
  });
});
