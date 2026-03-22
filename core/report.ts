import path from "node:path";
import type { AnalysisResult } from "./analyze";

export function buildReportText(result: AnalysisResult) {
  if (result.unusedExports.length === 0) {
    return "siftr\n\nNo unused exports found.";
  }

  const lines = ["siftr", "", `${result.unusedExports.length} unused exports found.`, ""];
  const exportsByFile = new Map<string, string[]>();

  for (const record of result.unusedExports) {
    const relativePath =
      path.relative(result.cwd, record.filePath) || path.basename(record.filePath);
    const fileLines = exportsByFile.get(relativePath) ?? [];
    fileLines.push(`  ${record.exportName} (${record.line}:${record.column})`);
    exportsByFile.set(relativePath, fileLines);
  }

  const sortedFiles = [...exportsByFile.keys()].sort((left, right) => left.localeCompare(right));
  for (const filePath of sortedFiles) {
    lines.push(filePath);
    lines.push(...(exportsByFile.get(filePath) ?? []));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
