#!/usr/bin/env bun

import process from "node:process";
import { parseCliArgs } from "./core/args";
import { analyzeProject } from "./core/analyze";
import { buildReportText } from "./core/report";

export async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    console.log(buildHelpText());
    return;
  }

  const result = analyzeProject(args.cwd);
  console.log(buildReportText(result));

  process.exit(result.unusedExports.length > 0 ? 1 : 0);
}

export function buildHelpText() {
  return `sift

Find unused exports in a TypeScript project.

Usage:
  sift
  sift <path>

Examples:
  sift
  sift .
  sift packages/app
`;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
