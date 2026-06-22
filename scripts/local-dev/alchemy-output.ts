import {
  parseAlchemyLocalTargetOutputKey,
  parseLocalTargetPort,
  type AlchemyLocalTargetOutputKey,
  type LocalHttpServiceName,
  type LocalTargetPort,
} from "./topology.ts";

const targetLinePattern = /^\s*(\w+TargetUrl)\s*:\s*['"]([^'"]+)['"],?\s*$/;
const loopbackHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Parsed Alchemy local service target. */
export type AlchemyLocalTarget = {
  readonly outputKey: AlchemyLocalTargetOutputKey;
  readonly serviceName: LocalHttpServiceName;
  readonly url: URL;
  readonly port: LocalTargetPort;
};

/** Parse one line of Alchemy output into a local service target when possible. */
export function parseAlchemyLocalTargetLine(
  line: string,
): AlchemyLocalTarget | undefined {
  const match = targetLinePattern.exec(line);

  if (match === null) {
    return undefined;
  }

  const key = match[1];
  const rawUrl = match[2];

  if (key === undefined || rawUrl === undefined) {
    return undefined;
  }

  const outputKey = parseTargetOutputKey(key);

  if (outputKey === undefined) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);

    if (!isLocalTargetUrl(url)) {
      return undefined;
    }

    return {
      outputKey,
      serviceName: serviceNameForTargetKey(outputKey),
      url,
      port: parseLocalTargetPort(Number.parseInt(url.port, 10)),
    };
  } catch {
    return undefined;
  }
}

function isLocalTargetUrl(url: URL) {
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    loopbackHostnames.has(url.hostname) &&
    url.username.length === 0 &&
    url.password.length === 0 &&
    url.port.length > 0
  );
}

function serviceNameForTargetKey(
  key: AlchemyLocalTargetOutputKey,
): LocalHttpServiceName {
  switch (key) {
    case "localAppTargetUrl":
      return "app";
    case "localApiTargetUrl":
      return "api";
  }
}

function parseTargetOutputKey(
  input: string,
): AlchemyLocalTargetOutputKey | undefined {
  try {
    return parseAlchemyLocalTargetOutputKey(input);
  } catch {
    return undefined;
  }
}

/** Incrementally parse Alchemy output chunks while preserving partial lines. */
export function createAlchemyOutputObserver(
  onTarget: (target: AlchemyLocalTarget) => void,
) {
  let bufferedLine = "";

  return (chunk: string) => {
    const lines = `${bufferedLine}${chunk}`.split(/\r?\n/);
    const nextBufferedLine = lines.pop();
    bufferedLine = nextBufferedLine ?? "";

    for (const line of lines) {
      const target = parseAlchemyLocalTargetLine(line);

      if (target !== undefined) {
        onTarget(target);
      }
    }
  };
}
