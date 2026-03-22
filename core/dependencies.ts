import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";

type PackageJsonRecord = {
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
};

type DependencyUsage = {
  unusedDependencies: string[];
  unusedDevDependencies: string[];
};

const builtinPackageNames = new Set(
  builtinModules.flatMap((moduleName) =>
    moduleName.startsWith("node:")
      ? [moduleName, moduleName.slice(5)]
      : [moduleName, `node:${moduleName}`],
  ),
);

const scriptCommandAliases = new Map<string, string>([["tsc", "typescript"]]);

export function analyzeDependencyUsage(cwd: string, sourceFiles: ts.SourceFile[]): DependencyUsage {
  const packageJson = loadPackageJson(cwd);
  const usedPackages = new Set<string>();

  collectPackagesFromSourceFiles(sourceFiles, usedPackages);
  collectPackagesFromScripts(packageJson, usedPackages);
  collectPackagesFromConfigFiles(cwd, usedPackages);

  return {
    unusedDependencies: packageJson.dependencies
      .filter((dependency) => !usedPackages.has(dependency))
      .sort((left, right) => left.localeCompare(right)),
    unusedDevDependencies: packageJson.devDependencies
      .filter((dependency) => !usedPackages.has(dependency))
      .sort((left, right) => left.localeCompare(right)),
  };
}

function loadPackageJson(cwd: string): PackageJsonRecord {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return {
      dependencies: [],
      devDependencies: [],
      scripts: {},
    };
  }

  const rawPackageJson = fs.readFileSync(packageJsonPath, "utf8");
  const packageJson = JSON.parse(rawPackageJson) as Record<string, unknown>;

  return {
    dependencies: Object.keys(asStringRecord(packageJson.dependencies)),
    devDependencies: Object.keys(asStringRecord(packageJson.devDependencies)),
    scripts: asStringRecord(packageJson.scripts),
  };
}

function collectPackagesFromSourceFiles(sourceFiles: ts.SourceFile[], usedPackages: Set<string>) {
  for (const sourceFile of sourceFiles) {
    visitNode(sourceFile, (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        addPackageUsage(node.moduleSpecifier.text, usedPackages);
        return;
      }

      if (!ts.isCallExpression(node)) {
        return;
      }

      const firstArgument = node.arguments[0];
      if (!firstArgument || !ts.isStringLiteral(firstArgument)) {
        return;
      }

      if (
        (ts.isIdentifier(node.expression) && node.expression.text === "require") ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        addPackageUsage(firstArgument.text, usedPackages);
      }
    });
  }
}

function collectPackagesFromScripts(packageJson: PackageJsonRecord, usedPackages: Set<string>) {
  const declaredPackages = new Set([...packageJson.dependencies, ...packageJson.devDependencies]);

  for (const command of Object.values(packageJson.scripts)) {
    const tokens = command.match(/[A-Za-z0-9@/_-]+/g) ?? [];

    for (const token of tokens) {
      const aliasedToken = scriptCommandAliases.get(token) ?? token;
      if (declaredPackages.has(aliasedToken)) {
        usedPackages.add(aliasedToken);
      }
    }
  }
}

function collectPackagesFromConfigFiles(cwd: string, usedPackages: Set<string>) {
  if (fs.existsSync(path.join(cwd, "tsconfig.json"))) {
    usedPackages.add("typescript");
  }
}

function addPackageUsage(specifier: string, usedPackages: Set<string>) {
  const packageName = normalizePackageName(specifier);
  if (!packageName || builtinPackageNames.has(packageName)) {
    return;
  }

  usedPackages.add(packageName);
}

function normalizePackageName(specifier: string) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#") ||
    specifier.startsWith("bun:")
  ) {
    return undefined;
  }

  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : undefined;
  }

  const [name] = specifier.split("/");
  return name;
}

function visitNode(node: ts.Node, callback: (node: ts.Node) => void) {
  callback(node);
  node.forEachChild((child) => visitNode(child, callback));
}

function asStringRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
