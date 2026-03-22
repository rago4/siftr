import path from "node:path";
import ts from "typescript";
import { analyzeDependencyUsage } from "./dependencies";
import { loadProject, resolveModuleSourceFile } from "./project";

type ExportRecord = {
  id: string;
  filePath: string;
  exportName: string;
  line: number;
  column: number;
  synthetic: boolean;
};

export type AnalysisResult = {
  cwd: string;
  defaultExports: ExportRecord[];
  totalExports: number;
  unusedDependencies: string[];
  unusedDevDependencies: string[];
  unusedExports: ExportRecord[];
};

type ReExportEdge = {
  fromId: string;
  toFilePath: string;
  toExportName: string;
};

type StarReExport = {
  fromFilePath: string;
  targetFilePath: string;
  position: number;
};

type ImportUsage =
  | {
      kind: "named";
      filePath: string;
      exportName: string;
    }
  | {
      kind: "all";
      filePath: string;
    };

export function analyzeProject(cwd: string): AnalysisResult {
  const project = loadProject(cwd);
  const dependencyUsage = analyzeDependencyUsage(project.cwd, project.sourceFiles);
  const modules = new Map<string, Map<string, ExportRecord>>();
  const explicitRecordIds = new Set<string>();
  const reExportEdges: ReExportEdge[] = [];
  const starReExports: StarReExport[] = [];
  const importUsages: ImportUsage[] = [];

  for (const sourceFile of project.sourceFiles) {
    const moduleExports = new Map<string, ExportRecord>();
    modules.set(path.resolve(sourceFile.fileName), moduleExports);

    collectModuleData(
      sourceFile,
      moduleExports,
      explicitRecordIds,
      reExportEdges,
      starReExports,
      importUsages,
      project.program,
      project.compilerOptions,
    );
  }

  expandStarReExports(modules, reExportEdges, starReExports);

  const graph = new Map<string, Set<string>>();
  for (const edge of reExportEdges) {
    const targetRecord = modules.get(edge.toFilePath)?.get(edge.toExportName);
    if (!targetRecord) {
      continue;
    }

    const targets = graph.get(edge.fromId) ?? new Set<string>();
    targets.add(targetRecord.id);
    graph.set(edge.fromId, targets);
  }

  const usedRecordIds = new Set<string>();
  const queue: string[] = [];

  for (const [filePath, moduleExports] of modules) {
    if (!project.publicEntryFiles.has(filePath)) {
      continue;
    }

    for (const record of moduleExports.values()) {
      markUsed(record.id, usedRecordIds, queue);
    }
  }

  for (const usage of importUsages) {
    const moduleExports = modules.get(usage.filePath);
    if (!moduleExports) {
      continue;
    }

    if (usage.kind === "all") {
      for (const record of moduleExports.values()) {
        markUsed(record.id, usedRecordIds, queue);
      }
      continue;
    }

    const record = moduleExports.get(usage.exportName);
    if (record) {
      markUsed(record.id, usedRecordIds, queue);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    for (const targetId of graph.get(currentId) ?? []) {
      markUsed(targetId, usedRecordIds, queue);
    }
  }

  const allRecords = [...modules.values()].flatMap((moduleExports) => [...moduleExports.values()]);
  const defaultExports = allRecords
    .filter((record) => explicitRecordIds.has(record.id))
    .filter((record) => record.exportName === "default")
    .sort((left, right) => {
      if (left.filePath !== right.filePath) {
        return left.filePath.localeCompare(right.filePath);
      }

      return left.line - right.line;
    });
  const unusedExports = allRecords
    .filter((record) => explicitRecordIds.has(record.id))
    .filter((record) => record.exportName !== "default")
    .filter((record) => !usedRecordIds.has(record.id))
    .sort((left, right) => {
      if (left.filePath !== right.filePath) {
        return left.filePath.localeCompare(right.filePath);
      }

      if (left.line !== right.line) {
        return left.line - right.line;
      }

      return left.exportName.localeCompare(right.exportName);
    });

  return {
    cwd: project.cwd,
    defaultExports,
    totalExports: allRecords.length,
    unusedDependencies: dependencyUsage.unusedDependencies,
    unusedDevDependencies: dependencyUsage.unusedDevDependencies,
    unusedExports,
  };
}

function collectModuleData(
  sourceFile: ts.SourceFile,
  moduleExports: Map<string, ExportRecord>,
  explicitRecordIds: Set<string>,
  reExportEdges: ReExportEdge[],
  starReExports: StarReExport[],
  importUsages: ImportUsage[],
  program: ts.Program,
  compilerOptions: ts.CompilerOptions,
) {
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImportUsage(statement, sourceFile, importUsages, program, compilerOptions);
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      collectNamedDeclarationExport(statement, sourceFile, moduleExports, explicitRecordIds);
      continue;
    }

    if (ts.isClassDeclaration(statement)) {
      collectNamedDeclarationExport(statement, sourceFile, moduleExports, explicitRecordIds);
      continue;
    }

    if (ts.isInterfaceDeclaration(statement)) {
      collectNamedDeclarationExport(statement, sourceFile, moduleExports, explicitRecordIds);
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      collectNamedDeclarationExport(statement, sourceFile, moduleExports, explicitRecordIds);
      continue;
    }

    if (ts.isEnumDeclaration(statement)) {
      collectNamedDeclarationExport(statement, sourceFile, moduleExports, explicitRecordIds);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      if (!hasExportModifier(statement)) {
        continue;
      }

      for (const declaration of statement.declarationList.declarations) {
        for (const identifier of collectBindingIdentifiers(declaration.name)) {
          const record = addExportRecord(
            moduleExports,
            sourceFile,
            identifier.text,
            identifier.getStart(sourceFile),
            false,
          );
          explicitRecordIds.add(record.id);
        }
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      const record = addExportRecord(
        moduleExports,
        sourceFile,
        "default",
        statement.getStart(sourceFile),
        false,
      );
      explicitRecordIds.add(record.id);
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      collectExportDeclaration(
        statement,
        sourceFile,
        moduleExports,
        explicitRecordIds,
        reExportEdges,
        starReExports,
        program,
        compilerOptions,
      );
    }
  }
}

function collectNamedDeclarationExport(
  statement:
    | ts.FunctionDeclaration
    | ts.ClassDeclaration
    | ts.InterfaceDeclaration
    | ts.TypeAliasDeclaration
    | ts.EnumDeclaration,
  sourceFile: ts.SourceFile,
  moduleExports: Map<string, ExportRecord>,
  explicitRecordIds: Set<string>,
) {
  if (!hasExportModifier(statement)) {
    return;
  }

  const exportName = hasDefaultModifier(statement) ? "default" : statement.name?.text;
  if (!exportName) {
    return;
  }

  const record = addExportRecord(
    moduleExports,
    sourceFile,
    exportName,
    statement.getStart(sourceFile),
    false,
  );
  explicitRecordIds.add(record.id);
}

function collectExportDeclaration(
  statement: ts.ExportDeclaration,
  sourceFile: ts.SourceFile,
  moduleExports: Map<string, ExportRecord>,
  explicitRecordIds: Set<string>,
  reExportEdges: ReExportEdge[],
  starReExports: StarReExport[],
  program: ts.Program,
  compilerOptions: ts.CompilerOptions,
) {
  const moduleSpecifier = getModuleSpecifierText(statement);
  const targetSourceFile = moduleSpecifier
    ? resolveModuleSourceFile(program, compilerOptions, sourceFile.fileName, moduleSpecifier)
    : undefined;
  const targetFilePath = targetSourceFile ? path.resolve(targetSourceFile.fileName) : undefined;

  if (!statement.exportClause) {
    if (targetFilePath) {
      starReExports.push({
        fromFilePath: path.resolve(sourceFile.fileName),
        targetFilePath,
        position: statement.getStart(sourceFile),
      });
    }
    return;
  }

  if (ts.isNamespaceExport(statement.exportClause)) {
    const record = addExportRecord(
      moduleExports,
      sourceFile,
      statement.exportClause.name.text,
      statement.exportClause.name.getStart(sourceFile),
      false,
    );
    explicitRecordIds.add(record.id);

    if (targetFilePath) {
      starReExports.push({
        fromFilePath: path.resolve(sourceFile.fileName),
        targetFilePath,
        position: statement.getStart(sourceFile),
      });
    }

    return;
  }

  for (const element of statement.exportClause.elements) {
    const exportedName = element.name.text;
    const importedName = element.propertyName?.text ?? element.name.text;
    const record = addExportRecord(
      moduleExports,
      sourceFile,
      exportedName,
      element.getStart(sourceFile),
      false,
    );
    explicitRecordIds.add(record.id);

    if (targetFilePath) {
      reExportEdges.push({
        fromId: record.id,
        toFilePath: targetFilePath,
        toExportName: importedName,
      });
    }
  }
}

function collectImportUsage(
  statement: ts.ImportDeclaration,
  sourceFile: ts.SourceFile,
  importUsages: ImportUsage[],
  program: ts.Program,
  compilerOptions: ts.CompilerOptions,
) {
  const moduleSpecifier = getModuleSpecifierText(statement);
  if (!moduleSpecifier || !statement.importClause) {
    return;
  }

  const targetSourceFile = resolveModuleSourceFile(
    program,
    compilerOptions,
    sourceFile.fileName,
    moduleSpecifier,
  );
  if (!targetSourceFile) {
    return;
  }

  const targetFilePath = path.resolve(targetSourceFile.fileName);

  if (statement.importClause.name) {
    importUsages.push({
      kind: "named",
      filePath: targetFilePath,
      exportName: "default",
    });
  }

  if (!statement.importClause.namedBindings) {
    return;
  }

  if (ts.isNamespaceImport(statement.importClause.namedBindings)) {
    importUsages.push({
      kind: "all",
      filePath: targetFilePath,
    });
    return;
  }

  for (const element of statement.importClause.namedBindings.elements) {
    importUsages.push({
      kind: "named",
      filePath: targetFilePath,
      exportName: element.propertyName?.text ?? element.name.text,
    });
  }
}

function expandStarReExports(
  modules: Map<string, Map<string, ExportRecord>>,
  reExportEdges: ReExportEdge[],
  starReExports: StarReExport[],
) {
  let changed = true;

  while (changed) {
    changed = false;

    for (const starReExport of starReExports) {
      const fromModule = modules.get(starReExport.fromFilePath);
      const targetModule = modules.get(starReExport.targetFilePath);
      if (!fromModule || !targetModule) {
        continue;
      }

      for (const targetRecord of targetModule.values()) {
        if (targetRecord.exportName === "default") {
          continue;
        }

        if (fromModule.has(targetRecord.exportName)) {
          continue;
        }

        const syntheticRecord = createExportRecord(
          starReExport.fromFilePath,
          targetRecord.exportName,
          starReExport.position,
          false,
          true,
        );
        fromModule.set(syntheticRecord.exportName, syntheticRecord);
        reExportEdges.push({
          fromId: syntheticRecord.id,
          toFilePath: starReExport.targetFilePath,
          toExportName: targetRecord.exportName,
        });
        changed = true;
      }
    }
  }
}

function addExportRecord(
  moduleExports: Map<string, ExportRecord>,
  sourceFile: ts.SourceFile,
  exportName: string,
  position: number,
  synthetic: boolean,
) {
  const filePath = path.resolve(sourceFile.fileName);
  const existing = moduleExports.get(exportName);
  if (existing) {
    return existing;
  }

  const record = createExportRecord(filePath, exportName, position, sourceFile, synthetic);
  moduleExports.set(exportName, record);
  return record;
}

function createExportRecord(
  filePath: string,
  exportName: string,
  position: number,
  sourceFile: ts.SourceFile | false,
  synthetic: boolean,
): ExportRecord {
  const lineAndCharacter = sourceFile
    ? sourceFile.getLineAndCharacterOfPosition(position)
    : { line: 0, character: 0 };

  return {
    id: `${filePath}#${exportName}`,
    filePath,
    exportName,
    line: lineAndCharacter.line + 1,
    column: lineAndCharacter.character + 1,
    synthetic,
  };
}

function collectBindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) {
    return [name];
  }

  const identifiers: ts.Identifier[] = [];
  for (const element of name.elements) {
    if (!element || !ts.isBindingElement(element)) {
      continue;
    }

    identifiers.push(...collectBindingIdentifiers(element.name));
  }

  return identifiers;
}

function hasExportModifier(node: ts.Node) {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
        false)
    : false;
}

function hasDefaultModifier(node: ts.Node) {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ??
        false)
    : false;
}

function getModuleSpecifierText(
  statement: ts.ImportDeclaration | ts.ExportDeclaration,
): string | undefined {
  return statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
    ? statement.moduleSpecifier.text
    : undefined;
}

function markUsed(recordId: string, usedRecordIds: Set<string>, queue: string[]) {
  if (usedRecordIds.has(recordId)) {
    return;
  }

  usedRecordIds.add(recordId);
  queue.push(recordId);
}
