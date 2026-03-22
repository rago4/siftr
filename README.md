# siftr

`siftr` is a tiny CLI for finding unused exports in a TypeScript codebase.

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

- TypeScript-first static analysis
- no config file
- current directory or a single path argument
- conservative behavior when module resolution is unclear
- explicit default exports are listed in a separate review section

## Known limitations

- namespace imports are treated conservatively
- dynamic runtime usage is not detected
- framework-specific magic entrypoints are not modeled yet
