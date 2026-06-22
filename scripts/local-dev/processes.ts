import type { LocalAlchemyStage } from "./topology.ts";

/** Process table row used by the local dev cleanup scanner. */
export type LocalProcess = {
  readonly pid: number;
  readonly parentPid: number;
  readonly processGroupId: number;
  readonly command: string;
};

/** Parse one `ps` output row into process metadata. */
export function parseLocalProcessLine(line: string): LocalProcess | undefined {
  const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line);

  if (match === null) {
    return undefined;
  }

  const rawPid = match[1];
  const rawParentPid = match[2];
  const rawProcessGroupId = match[3];
  const command = match[4];

  if (
    rawPid === undefined ||
    rawParentPid === undefined ||
    rawProcessGroupId === undefined ||
    command === undefined
  ) {
    return undefined;
  }

  const pid = parseProcessNumber(rawPid);
  const parentPid = parseProcessNumber(rawParentPid);
  const processGroupId = parseProcessNumber(rawProcessGroupId);

  if (
    pid === undefined ||
    parentPid === undefined ||
    processGroupId === undefined
  ) {
    return undefined;
  }

  return {
    command,
    parentPid,
    pid,
    processGroupId,
  };
}

/** Return true when a process command is the local Alchemy dev process for a stage. */
export function commandIsAlchemyDevStage(
  command: string,
  stage: LocalAlchemyStage,
) {
  const tokens = tokenizeProcessCommand(command);

  return hasAlchemyDevStackShape(tokens) && hasExactStageArgument(tokens, stage);
}

function parseProcessNumber(input: string) {
  const parsed = Number.parseInt(input, 10);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function tokenizeProcessCommand(command: string) {
  return command.trim().split(/\s+/).filter((token) => token.length > 0);
}

function hasAlchemyDevStackShape(tokens: ReadonlyArray<string>) {
  const stackFileIndex = tokens.findIndex(isAlchemyStackFile);

  if (stackFileIndex < 1 || tokens[stackFileIndex - 1] !== "dev") {
    return false;
  }

  return tokens.slice(0, stackFileIndex - 1).some(isAlchemyInvocationToken);
}

function isAlchemyStackFile(token: string) {
  return token === "alchemy.run.ts" || token.endsWith("/alchemy.run.ts");
}

function isAlchemyInvocationToken(token: string) {
  return (
    token === "alchemy" ||
    token.endsWith("/alchemy") ||
    token.includes("/alchemy/") ||
    token.includes("alchemy@")
  );
}

function hasExactStageArgument(
  tokens: ReadonlyArray<string>,
  stage: LocalAlchemyStage,
) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === "--stage" && tokens[index + 1] === stage) {
      return true;
    }

    if (token === `--stage=${stage}`) {
      return true;
    }
  }

  return false;
}
