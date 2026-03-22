import path from "node:path";
import type { AnalysisResult } from "./analyze";

export function buildReportText(result: AnalysisResult) {
  if (result.unusedExports.length === 0 && result.defaultExports.length === 0) {
    return "siftr\n\nNo unused exports found.";
  }

  const lines = ["siftr", ""];
  const exportsByFile = new Map<string, string[]>();

  if (result.unusedExports.length > 0) {
    lines.push(`${result.unusedExports.length} unused exports found.`);
    lines.push("");

    for (const record of result.unusedExports) {
      const relativePath = formatRelativePath(result.cwd, record.filePath);
      const fileLines = exportsByFile.get(relativePath) ?? [];
      fileLines.push(`  ${record.exportName} ${formatLocation(record.line, record.column)}`);
      exportsByFile.set(relativePath, fileLines);
    }

    const sortedFiles = [...exportsByFile.keys()].sort((left, right) => left.localeCompare(right));
    for (const filePath of sortedFiles) {
      lines.push(filePath);
      lines.push(...(exportsByFile.get(filePath) ?? []));
      lines.push("");
    }
  }

  if (result.defaultExports.length > 0) {
    lines.push("Default exports to review:");
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
