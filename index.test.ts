import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeProject } from "./core/analyze";
import { parseCliArgs } from "./core/args";
import { buildReportText } from "./core/report";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

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

describe("analyzeProject", () => {
  test("reports a basic unused named export", async () => {
    const fixture = await createFixture({
      "package.json": JSON.stringify({ name: "fixture", module: "./src/index.ts" }, null, 2),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ESNext",
            module: "Preserve",
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            noEmit: true,
          },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      ),
      "src/index.ts": 'import { used } from "./math";\n\nused();\n',
      "src/math.ts": "export const used = () => 1;\nexport const unused = () => 2;\n",
    });

    const result = analyzeProject(fixture);

    expect(
      result.unusedExports.map((record) => [path.basename(record.filePath), record.exportName]),
    ).toEqual([["math.ts", "unused"]]);
  });

  test("treats package entry re-exports as public API", async () => {
    const fixture = await createFixture({
      "package.json": JSON.stringify({ name: "fixture", module: "./src/index.ts" }, null, 2),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ESNext",
            module: "Preserve",
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            noEmit: true,
          },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      ),
      "src/index.ts": 'export { kept } from "./lib";\n',
      "src/lib.ts": "export const kept = () => 1;\nexport const dropped = () => 2;\n",
    });

    const result = analyzeProject(fixture);

    expect(result.unusedExports.map((record) => record.exportName)).toEqual(["dropped"]);
  });

  test("propagates usage through export star barrels", async () => {
    const fixture = await createFixture({
      "package.json": JSON.stringify({ name: "fixture" }, null, 2),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ESNext",
            module: "Preserve",
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            noEmit: true,
          },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      ),
      "src/app.ts": 'import { kept } from "./barrel";\n\nkept();\n',
      "src/barrel.ts": 'export * from "./lib";\n',
      "src/lib.ts": "export const kept = () => 1;\nexport const dropped = () => 2;\n",
    });

    const result = analyzeProject(fixture);

    expect(
      result.unusedExports.map((record) => [path.basename(record.filePath), record.exportName]),
    ).toEqual([["lib.ts", "dropped"]]);
  });

  test("prints a readable report", async () => {
    const fixture = await createFixture({
      "package.json": JSON.stringify({ name: "fixture" }, null, 2),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ESNext",
            module: "Preserve",
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            noEmit: true,
          },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      ),
      "src/index.ts": "export const unused = 1;\n",
    });

    const result = analyzeProject(fixture);
    const report = buildReportText(result);

    expect(report).toContain("1 unused exports found.");
    expect(report).toContain("src/index.ts");
    expect(report).toContain("unused");
  });
});

async function createFixture(files: Record<string, string>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "siftr-"));
  tempDirs.push(directory);

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(directory, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }

  return directory;
}
