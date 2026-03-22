import path from "node:path";
import type { AnalysisResult } from "./analyze";

export function buildReportText(result: AnalysisResult) {
  if (result.unusedExports.length === 0 && result.defaultExports.length === 0) {
    return "siftr\n\nNo unused exports found.";
  }

  const lines = ["siftr", ""];

  if (result.unusedExports.length > 0) {
    lines.push(`Unused exports (${result.unusedExports.length})`);
    lines.push("");

    lines.push(...formatGroupedExports(result.cwd, result.unusedExports));
  }

  if (result.defaultExports.length > 0) {
    lines.push(`Default exports to review (${result.defaultExports.length})`);
    lines.push("");

    for (const record of result.defaultExports) {
      lines.push(
        `${formatRelativePath(result.cwd, record.filePath)} ${formatLocation(record.line, record.column)}`,
      );
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatRelativePath(cwd: string, filePath: string) {
  return path.relative(cwd, filePath) || path.basename(filePath);
}

function formatLocation(line: number, column: number) {
  return `(${line}:${column})`;
}

function formatGroupedExports(cwd: string, records: AnalysisResult["unusedExports"]) {
  const exportsByFile = new Map<string, string[]>();

  for (const record of records) {
    const relativePath = formatRelativePath(cwd, record.filePath);
    const fileLines = exportsByFile.get(relativePath) ?? [];
    fileLines.push(`  ${record.exportName} ${formatLocation(record.line, record.column)}`);
    exportsByFile.set(relativePath, fileLines);
  }

  const lines: string[] = [];
  const sortedFiles = [...exportsByFile.keys()].sort((left, right) => left.localeCompare(right));
  for (const filePath of sortedFiles) {
    lines.push(filePath);
    lines.push(...(exportsByFile.get(filePath) ?? []));
    lines.push("");
  }

  return lines;
}
