import path from "node:path";

type ParsedCliArgs = {
  help: boolean;
  cwd: string;
};

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  if (argv.length === 0) {
    return {
      help: false,
      cwd: process.cwd(),
    };
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    return {
      help: true,
      cwd: process.cwd(),
    };
  }

  const unknownFlag = argv.find((arg) => arg.startsWith("-"));
  if (unknownFlag) {
    throw new Error(`unknown option: ${unknownFlag}`);
  }

  if (argv.length > 1) {
    throw new Error("expected at most one path argument");
  }

  return {
    help: false,
    cwd: path.resolve(argv[0] ?? "."),
  };
}
