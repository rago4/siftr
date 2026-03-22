import { describe, expect, test } from "bun:test";
import path from "node:path";
import { analyzeProject } from "../core/analyze";
import { createFixture } from "./helpers/fixture";

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

  test("moves default exports into a separate review list", async () => {
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
      "src/index.ts": "export default function main() { return 1; }\nexport const unused = 2;\n",
    });

    const result = analyzeProject(fixture);

    expect(result.unusedExports.map((record) => record.exportName)).toEqual(["unused"]);
    expect(
      result.defaultExports.map((record) => [path.basename(record.filePath), record.exportName]),
    ).toEqual([["index.ts", "default"]]);
  });

  test("reports unused dependencies and ignores tsconfig-driven typescript usage", async () => {
    const fixture = await createFixture({
      "package.json": JSON.stringify(
        {
          name: "fixture",
          dependencies: {
            react: "^19.0.0",
            lodash: "^4.17.21",
            typescript: "^5.0.0",
          },
        },
        null,
        2,
      ),
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
      "src/index.ts": 'import React from "react";\n\nconsole.log(React);\n',
    });

    const result = analyzeProject(fixture);

    expect(result.unusedDependencies).toEqual(["lodash"]);
    expect(result.unusedDevDependencies).toEqual([]);
  });

  test("reports unused dev dependencies and respects package scripts", async () => {
    const fixture = await createFixture({
      "package.json": JSON.stringify(
        {
          name: "fixture",
          scripts: {
            check: "tsc --noEmit",
          },
          devDependencies: {
            typescript: "^5.0.0",
            vitest: "^3.0.0",
          },
        },
        null,
        2,
      ),
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
      "src/index.ts": "export const used = 1;\n",
    });

    const result = analyzeProject(fixture);

    expect(result.unusedDependencies).toEqual([]);
    expect(result.unusedDevDependencies).toEqual(["vitest"]);
  });
});
