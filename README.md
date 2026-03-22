# sift

`sift` is a tiny CLI for finding unused exports in a TypeScript codebase.

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
sift
```

## How it works

`sift` parses the project with the TypeScript compiler API, builds a graph of exports and re-exports, marks exports used by imports or package entry files, and reports the rest.

## Current scope

- TypeScript-first static analysis
- no config file
- current directory or a single path argument
- conservative behavior when module resolution is unclear

## Known limitations

- namespace imports are treated conservatively
- dynamic runtime usage is not detected
- framework-specific magic entrypoints are not modeled yet
