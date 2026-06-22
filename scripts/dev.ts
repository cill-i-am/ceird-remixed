/// <reference types="node" />

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { basename } from "node:path";
import process, {
  env,
  stdout,
  stderr,
  kill as killProcess,
  platform,
} from "node:process";
import { Console, Effect, Schema } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import {
  createAlchemyOutputObserver,
  type AlchemyLocalTarget,
} from "./local-dev/alchemy-output.ts";
import {
  parsePortlessProxyPort,
  portlessListHasAliasRoute,
} from "./local-dev/portless-output.ts";
import {
  makeDefaultLocalAlchemyStage,
  makeLocalDevTopology,
  normalizeLocalAlchemyStage,
  type LocalAlchemyStage,
  type LocalDevTopology,
  type LocalHttpService,
  type LocalHttpServiceName,
  type LocalTargetPort,
} from "./local-dev/topology.ts";

class CommandFailed extends Schema.TaggedErrorClass<CommandFailed>()(
  "CommandFailed",
  {
    command: Schema.String,
    message: Schema.String,
    exitCode: Schema.optionalKey(Schema.Number),
    stderr: Schema.optionalKey(Schema.String),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

type LocalProcess = {
  readonly pid: number;
  readonly parentPid: number;
  readonly processGroupId: number;
  readonly command: string;
};

type RunCommandOptions = {
  readonly stdio: "pipe" | "inherit";
  readonly env?: NodeJS.ProcessEnv;
  readonly mirrorOutput?: boolean;
};

const portlessEnvOverrides = {
  PORTLESS: "1",
  PORTLESS_TLD: "localhost",
  PORTLESS_HTTPS: "1",
  PORTLESS_LAN: "0",
  PORTLESS_WILDCARD: "0",
  PORTLESS_TAILSCALE: "0",
  PORTLESS_FUNNEL: "0",
  PORTLESS_NGROK: "0",
} satisfies NodeJS.ProcessEnv;

const requiredLocalServiceNames = ["app", "api"] as const satisfies ReadonlyArray<
  LocalHttpServiceName
>;
const aliasReadinessTimeoutMs = 240_000;
const childShutdownTimeoutMs = 5_000;
const signalExitCodes = {
  SIGINT: 130,
  SIGTERM: 143,
} as const satisfies Record<"SIGINT" | "SIGTERM", number>;
const processGroupPollIntervalMs = 100;
const processGroupForceExitGraceMs = 1_000;

const runCommand = Effect.fn("runCommand")(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: RunCommandOptions,
) {
  const result = yield* Effect.try({
    try: () =>
      spawnSync(command, args, {
        encoding: "utf8",
        env: options.env ?? env,
        stdio:
          options.stdio === "inherit"
            ? "inherit"
            : ["ignore", "pipe", "pipe"],
      }),
    catch: (cause) =>
      CommandFailed.make({
        command: formatCommand(command, args),
        message: "Failed to start command.",
        cause,
      }),
  });

  if (result.error !== undefined) {
    return yield* Effect.fail(
      CommandFailed.make({
        command: formatCommand(command, args),
        message: "Command failed before it could exit.",
        cause: result.error,
      }),
    );
  }

  if (result.status !== 0) {
    const formattedCommand = formatCommand(command, args);
    const commandStderr =
      typeof result.stderr === "string" ? result.stderr.trim() : "";

    return yield* Effect.fail(
      CommandFailed.make({
        command: formattedCommand,
        message: "Command exited unsuccessfully.",
        ...(result.status === null ? {} : { exitCode: result.status }),
        ...(commandStderr.length === 0 ? {} : { stderr: commandStderr }),
      }),
    );
  }

  const commandStdout = typeof result.stdout === "string" ? result.stdout : "";
  const commandStderr = typeof result.stderr === "string" ? result.stderr : "";

  if (options.mirrorOutput === true) {
    stdout.write(commandStdout);
    stderr.write(commandStderr);
  }

  return {
    stdout: commandStdout,
    stderr: commandStderr,
  } satisfies CommandResult;
});

const readCurrentBranch = Effect.fn("readCurrentBranch")(function* () {
  const result = yield* runCommand("git", ["branch", "--show-current"], {
    stdio: "pipe",
  });
  return result.stdout.trim();
});

const readWorktreeName = Effect.fn("readWorktreeName")(function* () {
  const result = yield* runCommand("git", ["rev-parse", "--show-toplevel"], {
    stdio: "pipe",
  });
  const rootPath = result.stdout.trim();

  return rootPath.length === 0 ? "" : basename(rootPath);
});

const deriveDefaultStage = Effect.fn("deriveDefaultStage")(function* () {
  const branch = yield* readCurrentBranch().pipe(
    Effect.catch(() => Effect.succeed("")),
  );
  const worktreeName = yield* readWorktreeName().pipe(
    Effect.catch(() => Effect.succeed("")),
  );
  const user = env.USER?.trim() ?? "";

  return makeDefaultLocalAlchemyStage({ branch, user, worktreeName });
});

function makePortlessEnv(): NodeJS.ProcessEnv {
  return {
    ...env,
    ...portlessEnvOverrides,
  };
}

const ensurePortlessProxy = Effect.fn("ensurePortlessProxy")(function* () {
  yield* Console.log("Starting portless proxy if needed...");
  const status = yield* runCommand("pnpm", [
    "exec",
    "portless",
    "proxy",
    "start",
  ], {
    stdio: "pipe",
    env: makePortlessEnv(),
    mirrorOutput: true,
  });
  const proxyPort = parsePortlessProxyPort(
    `${status.stdout}\n${status.stderr}`,
  );

  if (proxyPort === undefined) {
    return yield* Effect.fail(
      CommandFailed.make({
        command: "pnpm exec portless proxy start",
        message: "Could not determine the portless proxy port.",
      }),
    );
  }

  return proxyPort;
});

const assertPortlessAliasRegistered = Effect.fn(
  "assertPortlessAliasRegistered",
)(function* (
  service: LocalHttpService,
  target: AlchemyLocalTarget,
) {
  const result = yield* runCommand(
    "pnpm",
    ["exec", "portless", "list"],
    {
      stdio: "pipe",
      env: makePortlessEnv(),
    },
  );

  if (
    !portlessListHasAliasRoute(result.stdout, {
      origin: service.origin.origin,
      targetPort: target.port,
    })
  ) {
    return yield* Effect.fail(
      CommandFailed.make({
        command: "pnpm exec portless list",
        message: `Portless alias ${service.alias} was not registered to localhost:${target.port}.`,
      }),
    );
  }
});

const registerPortlessAlias = Effect.fn("registerPortlessAlias")(function* (
  service: LocalHttpService,
  target: AlchemyLocalTarget,
) {
  yield* runCommand(
    "pnpm",
    [
      "exec",
      "portless",
      "alias",
      service.alias,
      target.port.toString(),
      "--force",
    ],
    {
      stdio: "pipe",
      env: makePortlessEnv(),
    },
  );

  yield* assertPortlessAliasRegistered(service, target);

  yield* Console.log(
    `Mapped ${service.origin.href} -> ${target.url.href}`,
  );
});

const removePortlessAlias = Effect.fn("removePortlessAlias")(function* (
  service: LocalHttpService,
) {
  yield* runCommand(
    "pnpm",
    ["exec", "portless", "alias", "--remove", service.alias],
    {
      stdio: "pipe",
      env: makePortlessEnv(),
    },
  ).pipe(Effect.catch(() => Effect.void));
});

function removePortlessAliasSync(service: LocalHttpService) {
  spawnSync("pnpm", ["exec", "portless", "alias", "--remove", service.alias], {
    encoding: "utf8",
    env: makePortlessEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function cleanupRegisteredAliasesSync(
  services: ReadonlyMap<LocalHttpServiceName, LocalHttpService>,
) {
  for (const service of services.values()) {
    removePortlessAliasSync(service);
  }
}

function findService(
  topology: LocalDevTopology,
  target: AlchemyLocalTarget,
): LocalHttpService {
  return target.serviceName === "app" ? topology.app : topology.api;
}

function makeLocalDevEnv(topology: LocalDevTopology): NodeJS.ProcessEnv {
  return {
    ...env,
    ALCHEMY_NO_TUI: env.ALCHEMY_NO_TUI ?? "1",
    CEIRD_LOCAL_APP_ORIGIN: topology.app.origin.href,
    CEIRD_LOCAL_API_ORIGIN: topology.api.origin.href,
    CEIRD_LOCAL_AUTH_BASE_URL: `${topology.api.origin.origin}/api/auth`,
    CEIRD_LOCAL_AUTH_COOKIE_DOMAIN: topology.authCookieDomain,
    CEIRD_LOCAL_TRUSTED_ORIGINS: topology.trustedOrigins,
    NODE_EXTRA_CA_CERTS:
      env.NODE_EXTRA_CA_CERTS ?? `${env.HOME ?? ""}/.portless/ca.pem`,
  };
}

function makeAlchemyArgs(
  stage: LocalAlchemyStage,
  options: Readonly<{
    profile: string;
    envFile: string;
    force: boolean;
  }>,
) {
  const args = [
    "exec",
    "alchemy",
    "dev",
    "alchemy.run.ts",
    "--stage",
    stage,
  ];

  if (options.profile.length > 0) {
    args.push("--profile", options.profile);
  }

  if (options.envFile.length > 0) {
    args.push("--env-file", options.envFile);
  }

  if (options.force) {
    args.push("--force");
  }

  return args;
}

function childHasExited(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null;
}

function isErrnoException(cause: unknown): cause is NodeJS.ErrnoException {
  return cause instanceof Error && "code" in cause;
}

function processGroupHasMembers(processGroupId: number) {
  try {
    killProcess(-processGroupId, 0);
    return true;
  } catch (cause) {
    return !(isErrnoException(cause) && cause.code === "ESRCH");
  }
}

function signalProcessGroup(processGroupId: number, signal: NodeJS.Signals) {
  try {
    killProcess(-processGroupId, signal);
    return true;
  } catch (cause) {
    return !(isErrnoException(cause) && cause.code === "ESRCH");
  }
}

function terminateProcessGroup(processGroupId: number) {
  return Effect.callback<void>((resume) => {
    if (!processGroupHasMembers(processGroupId)) {
      resume(Effect.void);
      return Effect.void;
    }

    let completed = false;
    let forceExitTimer: NodeJS.Timeout | undefined;
    const complete = () => {
      if (completed) {
        return;
      }

      completed = true;
      clearInterval(pollTimer);
      clearTimeout(killTimer);
      if (forceExitTimer !== undefined) {
        clearTimeout(forceExitTimer);
      }
      resume(Effect.void);
    };
    const pollTimer = setInterval(() => {
      if (!processGroupHasMembers(processGroupId)) {
        complete();
      }
    }, processGroupPollIntervalMs);
    const killTimer = setTimeout(() => {
      signalProcessGroup(processGroupId, "SIGKILL");
      forceExitTimer = setTimeout(complete, processGroupForceExitGraceMs);
    }, childShutdownTimeoutMs);

    if (!signalProcessGroup(processGroupId, "SIGTERM")) {
      complete();
    }

    return Effect.sync(() => {
      clearInterval(pollTimer);
      clearTimeout(killTimer);
      if (forceExitTimer !== undefined) {
        clearTimeout(forceExitTimer);
      }
    });
  });
}

function signalOwnedProcess(
  child: ChildProcess,
  processGroupId: number | undefined,
  signal: NodeJS.Signals,
) {
  if (processGroupId !== undefined) {
    return signalProcessGroup(processGroupId, signal);
  }

  if (childHasExited(child)) {
    return false;
  }

  try {
    child.kill(signal);
    return true;
  } catch {
    return false;
  }
}

function ownedProcessIsRunning(
  child: ChildProcess,
  processGroupId: number | undefined,
) {
  return processGroupId === undefined
    ? !childHasExited(child)
    : processGroupHasMembers(processGroupId);
}

function terminateChildProcess(
  child: ChildProcess,
  processGroupId: number | undefined,
) {
  if (processGroupId !== undefined) {
    return terminateProcessGroup(processGroupId);
  }

  return Effect.callback<void>((resume) => {
    if (!ownedProcessIsRunning(child, processGroupId)) {
      resume(Effect.void);
      return Effect.void;
    }

    let completed = false;
    let forceExitTimer: NodeJS.Timeout | undefined;
    const complete = () => {
      if (completed) {
        return;
      }

      completed = true;
      clearInterval(pollTimer);
      clearTimeout(killTimer);
      if (forceExitTimer !== undefined) {
        clearTimeout(forceExitTimer);
      }
      resume(Effect.void);
    };
    const pollTimer = setInterval(() => {
      if (!ownedProcessIsRunning(child, processGroupId)) {
        complete();
      }
    }, processGroupPollIntervalMs);
    const killTimer = setTimeout(() => {
      signalOwnedProcess(child, processGroupId, "SIGKILL");
      forceExitTimer = setTimeout(complete, processGroupForceExitGraceMs);
    }, childShutdownTimeoutMs);

    if (!signalOwnedProcess(child, processGroupId, "SIGTERM")) {
      complete();
    }

    return Effect.sync(() => {
      clearInterval(pollTimer);
      clearTimeout(killTimer);
      if (forceExitTimer !== undefined) {
        clearTimeout(forceExitTimer);
      }
    });
  });
}

function parseLocalProcess(line: string): LocalProcess | undefined {
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

function parseProcessNumber(input: string) {
  const parsed = Number.parseInt(input, 10);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function commandIsAlchemyDevStage(
  command: string,
  stage: LocalAlchemyStage,
) {
  return (
    command.includes("alchemy.run.ts") &&
    (
      command.includes(`--stage ${stage}`) ||
      command.includes(`--stage=${stage}`)
    )
  );
}

const findAlchemyDevProcessGroups = Effect.fn(
  "findAlchemyDevProcessGroups",
)(function* (stage: LocalAlchemyStage) {
  const result = yield* runCommand("ps", [
    "-axo",
    "pid=,ppid=,pgid=,command=",
  ], {
    stdio: "pipe",
  });
  const processGroupIds = new Set<number>();

  for (const line of result.stdout.split(/\r?\n/)) {
    const localProcess = parseLocalProcess(line);

    if (
      localProcess !== undefined &&
      localProcess.processGroupId !== process.pid &&
      commandIsAlchemyDevStage(localProcess.command, stage)
    ) {
      processGroupIds.add(localProcess.processGroupId);
    }
  }

  return processGroupIds;
});

const cleanupAlchemyDevProcesses = Effect.fn(
  "cleanupAlchemyDevProcesses",
)(function* (stage: LocalAlchemyStage) {
  const processGroupIds = yield* findAlchemyDevProcessGroups(stage);

  for (const processGroupId of processGroupIds) {
    yield* terminateProcessGroup(processGroupId);
  }
});

function cleanupRegisteredAliases(
  services: ReadonlyMap<LocalHttpServiceName, LocalHttpService>,
) {
  return Effect.gen(function* () {
    for (const service of services.values()) {
      yield* removePortlessAlias(service);
    }
  });
}

function cleanupAlchemyDev(
  stage: LocalAlchemyStage,
  child: ChildProcess,
  processGroupId: number | undefined,
  services: ReadonlyMap<LocalHttpServiceName, LocalHttpService>,
  options: Readonly<{ terminateChild: boolean }>,
) {
  return Effect.gen(function* () {
    if (options.terminateChild) {
      yield* terminateChildProcess(child, processGroupId);
      yield* cleanupAlchemyDevProcesses(stage);
    }

    yield* cleanupRegisteredAliases(services);
  });
}

const runAlchemyDev = Effect.fn("runAlchemyDev")(function* (
  topology: LocalDevTopology,
  options: Readonly<{
    profile: string;
    envFile: string;
    force: boolean;
  }>,
) {
  const args = makeAlchemyArgs(topology.stage, options);
  const childEnv = makeLocalDevEnv(topology);

  yield* Console.log(`Local app: ${topology.app.origin.href}`);
  yield* Console.log(`Local API: ${topology.api.origin.href}`);
  yield* Console.log(`Alchemy stage: ${topology.stage}`);

  return yield* Effect.callback<void, CommandFailed>((resume) => {
    const child = spawn("pnpm", args, {
      detached: platform !== "win32",
      env: childEnv,
      stdio: ["inherit", "pipe", "pipe"],
    });
    const processGroupId =
      platform === "win32" ? undefined : child.pid;
    let completed = false;
    let readinessTimer: NodeJS.Timeout | undefined;
    let registrationChain = Promise.resolve();
    const requestedPorts = new Map<LocalHttpServiceName, LocalTargetPort>();
    const registeredPorts = new Map<LocalHttpServiceName, LocalTargetPort>();
    const registeredServices = new Map<LocalHttpServiceName, LocalHttpService>();

    const cleanupAliasesOnExit = () => {
      cleanupRegisteredAliasesSync(registeredServices);
    };

    const unregisterProcessHooks = () => {
      process.off("SIGINT", handleSigint);
      process.off("SIGTERM", handleSigterm);
      process.off("exit", cleanupAliasesOnExit);
    };

    const clearReadinessTimer = () => {
      if (readinessTimer !== undefined) {
        clearTimeout(readinessTimer);
        readinessTimer = undefined;
      }
    };

    const completeAfterCleanup = (
      effect: Effect.Effect<void, CommandFailed>,
      cleanupOptions: Readonly<{ terminateChild: boolean }>,
    ) => {
      if (completed) {
        return;
      }

      completed = true;
      clearReadinessTimer();
      unregisterProcessHooks();
      Effect.runPromise(
        cleanupAlchemyDev(
          topology.stage,
          child,
          processGroupId,
          registeredServices,
          cleanupOptions,
        ),
      )
        .catch((cause) => {
          stderr.write(`Failed to clean up local dev aliases: ${String(cause)}\n`);
        })
        .finally(() => {
          resume(effect);
        });
    };

    const failAfterCleanup = (error: CommandFailed) => {
      completeAfterCleanup(Effect.fail(error), { terminateChild: true });
    };

    const exitAfterSignal = (signal: "SIGINT" | "SIGTERM") => {
      if (completed) {
        return;
      }

      completed = true;
      clearReadinessTimer();
      unregisterProcessHooks();
      cleanupRegisteredAliasesSync(registeredServices);
      Effect.runPromise(
        terminateChildProcess(child, processGroupId),
      )
        .catch((cause) => {
          stderr.write(`Failed to clean up local dev aliases: ${String(cause)}\n`);
        })
        .finally(() => {
          process.exit(signalExitCodes[signal]);
        });
    };

    const handleSigint = () => {
      exitAfterSignal("SIGINT");
    };
    const handleSigterm = () => {
      exitAfterSignal("SIGTERM");
    };

    process.once("SIGINT", handleSigint);
    process.once("SIGTERM", handleSigterm);
    process.once("exit", cleanupAliasesOnExit);

    readinessTimer = setTimeout(() => {
      const missingServices = requiredLocalServiceNames.filter(
        (serviceName) => !registeredPorts.has(serviceName),
      );

      failAfterCleanup(
        CommandFailed.make({
          command: "pnpm exec alchemy dev",
          message: `Timed out waiting for local target URLs for ${missingServices.join(", ")}.`,
        }),
      );
    }, aliasReadinessTimeoutMs);

    const registerTarget = (target: AlchemyLocalTarget) => {
      if (completed) {
        return;
      }

      const service = findService(topology, target);

      if (requestedPorts.get(service.name) === target.port) {
        return;
      }

      requestedPorts.set(service.name, target.port);
      registrationChain = registrationChain
        .then(() => Effect.runPromise(registerPortlessAlias(service, target)))
        .then(() => {
          if (completed) {
            return;
          }

          registeredPorts.set(service.name, target.port);
          registeredServices.set(service.name, service);

          if (
            requiredLocalServiceNames.every((serviceName) =>
              registeredPorts.has(serviceName),
            )
          ) {
            clearReadinessTimer();
          }
        })
        .catch((cause) => {
          failAfterCleanup(
            CommandFailed.make({
              command: `pnpm exec portless alias ${service.alias} ${target.port}`,
              message: "Failed to register a verified portless alias.",
              cause,
            }),
          );
        });
    };
    const observeOutput = createAlchemyOutputObserver((target) => {
      registerTarget(target);
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout.write(text);
      observeOutput(text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr.write(text);
      observeOutput(text);
    });

    child.on("error", (cause) => {
      failAfterCleanup(
        CommandFailed.make({
          command: formatCommand("pnpm", args),
          message: "Failed to start Alchemy dev.",
          cause,
        }),
      );
    });

    child.on("exit", (exitCode, signal) => {
      if (exitCode === 0) {
        completeAfterCleanup(Effect.void, { terminateChild: true });
        return;
      }

      completeAfterCleanup(
        Effect.fail(
          CommandFailed.make({
            command: formatCommand("pnpm", args),
            message:
              signal === null
                ? "Alchemy dev exited unsuccessfully."
                : `Alchemy dev exited from signal ${signal}.`,
            ...(exitCode === null ? {} : { exitCode }),
          }),
        ),
        { terminateChild: true },
      );
    });

    return Effect.gen(function* () {
      unregisterProcessHooks();
      yield* cleanupAlchemyDev(
        topology.stage,
        child,
        processGroupId,
        registeredServices,
        {
          terminateChild: true,
        },
      );
    }).pipe(
      Effect.catch((cause) =>
        Effect.sync(() => {
          stderr.write(`Failed to clean up local dev: ${String(cause)}\n`);
        }),
      ),
    );
  });
});

function formatCommand(command: string, args: ReadonlyArray<string>) {
  return [command, ...args].join(" ");
}

const stageFlag = Flag.string("stage").pipe(
  Flag.withDescription("Alchemy local stage. Defaults to the current branch."),
  Flag.withDefault(""),
);
const profileFlag = Flag.string("profile").pipe(
  Flag.withDescription("Alchemy profile to pass through."),
  Flag.withDefault(""),
);
const envFileFlag = Flag.string("env-file").pipe(
  Flag.withDescription("Alchemy env file to pass through."),
  Flag.withDefault(""),
);
const forceFlag = Flag.boolean("force").pipe(
  Flag.withDescription("Pass --force through to alchemy dev."),
);
const cleanupOnlyFlag = Flag.boolean("cleanup-only").pipe(
  Flag.withDescription("Remove portless aliases for the resolved stage and exit."),
);

const devCommand = Command.make(
  "ceird-dev",
  {
    stage: stageFlag,
    profile: profileFlag,
    envFile: envFileFlag,
    force: forceFlag,
    cleanupOnly: cleanupOnlyFlag,
  },
  Effect.fn("ceird-dev")(function* ({
    stage,
    profile,
    envFile,
    force,
    cleanupOnly,
  }) {
    const resolvedStage =
      stage.trim().length === 0
        ? yield* deriveDefaultStage()
        : normalizeLocalAlchemyStage(stage);

    if (cleanupOnly) {
      const topology = makeLocalDevTopology(resolvedStage);
      yield* cleanupAlchemyDevProcesses(topology.stage);
      yield* cleanupRegisteredAliases(
        new Map([
          [topology.app.name, topology.app],
          [topology.api.name, topology.api],
        ]),
      );
      return;
    }

    const proxyPort = yield* ensurePortlessProxy();
    const topology = makeLocalDevTopology(resolvedStage, { proxyPort });

    yield* runAlchemyDev(topology, { profile, envFile, force });
  }),
).pipe(
  Command.withDescription(
    "Run the local Cloudflare/Alchemy stack behind stable portless URLs.",
  ),
);

devCommand.pipe(
  Command.run({ version: "0.0.0" }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
