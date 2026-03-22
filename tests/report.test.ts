import { describe, expect, test } from "bun:test";
import { analyzeProject } from "../core/analyze";
import { buildReportText } from "../core/report";
import { createFixture } from "./helpers/fixture";

describe("buildReportText", () => {
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

    expect(report).toContain("Unused exports (1)");
    expect(report).toContain("src/index.ts");
    expect(report).toContain("unused");
  });

  test("prints default exports in a separate section", async () => {
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
      "src/index.ts": "export default function main() { return 1; }\n",
    });

    const result = analyzeProject(fixture);
    const report = buildReportText(result);

    expect(report).toContain("Default exports to review (1)");
    expect(report).toContain("src/index.ts");
    expect(report).not.toContain("Unused exports (");
  });

  test("prints unused dependency sections", async () => {
    const fixture = await createFixture({
      "package.json": JSON.stringify(
        {
          name: "fixture",
          dependencies: {
            react: "^19.0.0",
            lodash: "^4.17.21",
          },
          devDependencies: {
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
      "src/index.ts": 'import React from "react";\n\nconsole.log(React);\n',
    });

    const result = analyzeProject(fixture);
    const report = buildReportText(result);

    expect(report).toContain("Unused dependencies (1)");
    expect(report).toContain("lodash");
    expect(report).toContain("Unused devDependencies (1)");
    expect(report).toContain("vitest");
  });
});
