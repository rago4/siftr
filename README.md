# siftr

`siftr` is a tiny CLI for finding unused exports in a TypeScript codebase.

⚠️ Warning: `siftr` is still experimental, so treat the results as a strong review signal rather than an automatic source of truth.

## Install dependencies

```bash
bun install
```

## Run tests

```bash
bun test
```

## Verify before push

```bash
bun run verify
```

## Run locally

```bash
bun run index.ts
bun run index.ts .
```

You can also point it at another project directory:

```bash
bun run index.ts packages/app
```

## Install as a CLI

```bash
bun link
siftr
```

## Pre-push checks

A simple `pre-push` hook lives in [`.githooks/pre-push`](/Users/rafal.golawski/Projects/sift/.githooks/pre-push) and runs the project's verification command before Git pushes your branch.

Set it up once in your local clone:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
```

That hook executes:

```bash
bun run verify
```

## How it works

`siftr` parses the project with the TypeScript compiler API, builds a graph of exports and re-exports, marks exports used by imports or package entry files, and reports the rest.

## Current scope

- reports unused named exports
- lists explicit default exports in a separate review section
- reports unused `dependencies` and `devDependencies`
- recognizes package usage from source imports, package scripts, and `tsconfig.json`
- works on the current project or a provided project path

## Known limitations

- dynamic or runtime-only usage is not detected
- framework-specific entrypoints and conventions are not modeled yet
- some tooling packages may need broader config-file support in future
