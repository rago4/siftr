import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export type LoadedProject = {
  cwd: string;
  program: ts.Program;
  sourceFiles: ts.SourceFile[];
  compilerOptions: ts.CompilerOptions;
  publicEntryFiles: Set<string>;
};

export function loadProject(cwd: string): LoadedProject {
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    throw new Error(`could not find tsconfig.json from ${cwd}`);
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(formatDiagnostic(configFile.error));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );

  const firstError = parsedConfig.errors[0];
  if (firstError) {
    throw new Error(formatDiagnostic(firstError));
  }

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });

  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) => isProjectSourceFile(sourceFile, cwd));

  return {
    cwd,
    program,
    sourceFiles,
    compilerOptions: parsedConfig.options,
    publicEntryFiles: findPublicEntryFiles(cwd, program),
  };
}

export function resolveModuleSourceFile(
  program: ts.Program,
  compilerOptions: ts.CompilerOptions,
  fromFileName: string,
  specifier: string,
) {
  const resolved = ts.resolveModuleName(specifier, fromFileName, compilerOptions, ts.sys);
  const resolvedFileName = resolved.resolvedModule?.resolvedFileName;
  if (!resolvedFileName) {
    return undefined;
  }

  return program.getSourceFile(resolvedFileName);
}

function isProjectSourceFile(sourceFile: ts.SourceFile, cwd: string) {
  if (sourceFile.isDeclarationFile) {
    return false;
  }

  const normalized = path.resolve(sourceFile.fileName);
  if (!normalized.startsWith(cwd)) {
    return false;
  }

  return !normalized.includes(`${path.sep}node_modules${path.sep}`);
}

function findPublicEntryFiles(cwd: string, program: ts.Program) {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return new Set<string>();
  }

  const rawPackageJson = fs.readFileSync(packageJsonPath, "utf8");
  const packageJson = JSON.parse(rawPackageJson) as Record<string, unknown>;
  const entryCandidates = new Set<string>();

  for (const field of ["main", "module", "types", "typings"]) {
    const value = packageJson[field];
    if (typeof value === "string") {
      entryCandidates.add(path.resolve(cwd, value));
    }
  }

  const binField = packageJson.bin;
  if (typeof binField === "string") {
    entryCandidates.add(path.resolve(cwd, binField));
  }

  if (binField && typeof binField === "object") {
    for (const value of Object.values(binField)) {
      if (typeof value === "string") {
        entryCandidates.add(path.resolve(cwd, value));
      }
    }
  }

  collectExportsEntries(packageJson.exports, cwd, entryCandidates);

  const publicEntryFiles = new Set<string>();
  for (const candidate of entryCandidates) {
    const sourceFile = program.getSourceFile(candidate);
    if (sourceFile) {
      publicEntryFiles.add(path.resolve(sourceFile.fileName));
    }
  }

  return publicEntryFiles;
}

function collectExportsEntries(
  value: unknown,
  cwd: string,
  entryCandidates: Set<string>,
): void {
  if (typeof value === "string") {
    if (value.startsWith(".")) {
      entryCandidates.add(path.resolve(cwd, value));
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const nestedValue of Object.values(value)) {
    collectExportsEntries(nestedValue, cwd, entryCandidates);
  }
}

function formatDiagnostic(diagnostic: ts.Diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}
