import {
  parseLocalTargetPort,
  type LocalTargetPort,
} from "./topology.ts";

const proxyPortPattern = /port\s+(\d+)/i;

/** Parse the HTTPS proxy port reported by `portless proxy start`. */
export function parsePortlessProxyPort(
  output: string,
): LocalTargetPort | undefined {
  const match = proxyPortPattern.exec(output);
  const rawPort = match?.[1];

  if (rawPort === undefined) {
    return undefined;
  }

  try {
    return parseLocalTargetPort(Number.parseInt(rawPort, 10));
  } catch {
    return undefined;
  }
}

/** Check whether `portless list` contains a static alias route to a target port. */
export function portlessListHasAliasRoute(
  output: string,
  options: Readonly<{
    origin: string;
    targetPort: LocalTargetPort;
  }>,
) {
  const expectedTarget = `localhost:${options.targetPort}`;

  return output.split(/\r?\n/).some((line) =>
    line.includes(options.origin) &&
    line.includes(expectedTarget) &&
    line.includes("(alias)"),
  );
}
