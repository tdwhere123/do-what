import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_CORE_PORT = 3847;
const DEFAULT_HEALTH_INTERVAL_MS = 500;
const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
const SUPPORTED_SIGNALS = ['SIGINT', 'SIGTERM'];

function defaultSleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function resolvePnpmCommand(platform = process.platform) {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

export function resolveCoreBaseUrl(env = process.env) {
  const explicitBaseUrl = env.VITE_CORE_BASE_URL?.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, '');
  }

  const parsedPort = Number.parseInt(env.DOWHAT_PORT ?? '', 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_CORE_PORT;
  return `http://127.0.0.1:${port}`;
}

export async function probeCoreHealth(baseUrl, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${baseUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

function waitForChildExit(child) {
  if (child.exitCode !== null) {
    return Promise.resolve({
      code: child.exitCode,
      signal: null,
    });
  }

  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      child.off('exit', handleExit);
      reject(error);
    };
    const handleExit = (code, signal) => {
      child.off('error', handleError);
      resolve({ code, signal });
    };
    child.once('error', handleError);
    child.once('exit', handleExit);
  });
}

function createChildMonitor(child) {
  const state = {
    error: null,
    exit: null,
  };
  child.once('error', (error) => {
    state.error = error;
  });
  child.once('exit', (code, signal) => {
    state.exit = { code, signal };
  });
  return () => {
    if (state.error) {
      return {
        type: 'error',
        error: state.error,
      };
    }

    if (state.exit) {
      return {
        type: 'exit',
        ...state.exit,
      };
    }

    return null;
  };
}

async function stopChild(child, options) {
  if (!child || child.exitCode !== null) {
    return;
  }

  const waitForExit = waitForChildExit(child);
  child.kill(options.signal);
  const timedOut = await Promise.race([
    waitForExit.then(() => false),
    options.sleep(options.graceMs).then(() => true),
  ]);

  if (!timedOut || child.exitCode !== null) {
    await waitForExit;
    return;
  }

  options.logger.warn(
    `[dev] ${options.label} did not exit after ${options.graceMs}ms. Sending SIGKILL.`,
  );
  child.kill('SIGKILL');
  await waitForExit;
}

export async function waitForCoreReady(options) {
  const deadline = options.now() + options.timeoutMs;

  while (options.now() < deadline) {
    if (await probeCoreHealth(options.baseUrl, options.fetchImpl)) {
      return;
    }

    const coreStatus = options.getCoreStatus?.();
    if (coreStatus?.type === 'error') {
      throw new Error(
        `[dev] Core failed to start (${coreStatus.error.message}).`,
      );
    }

    if (coreStatus?.type === 'exit') {
      throw new Error(
        `[dev] Core exited before becoming healthy (${describeExit(coreStatus)}).`,
      );
    }

    await options.sleep(options.intervalMs);
  }

  throw new Error(
    `[dev] Timed out waiting for Core health at ${options.baseUrl}/health after ${Math.ceil(
      options.timeoutMs / 1000,
    )}s.`,
  );
}

function describeExit(exit) {
  return exit.signal ? `signal ${exit.signal}` : `code ${exit.code ?? 1}`;
}

function spawnPnpmCommand(command, args, options) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function registerSignalHandlers(signalHost, handler) {
  const registeredSignals = [];
  for (const signal of SUPPORTED_SIGNALS) {
    signalHost.on?.(signal, handler);
    registeredSignals.push([signal, handler]);
  }

  return () => {
    for (const [signal, registeredHandler] of registeredSignals) {
      signalHost.off?.(signal, registeredHandler);
    }
  };
}

async function startCoreIfNeeded(options) {
  if (await probeCoreHealth(options.baseUrl, options.fetchImpl)) {
    options.logger.log(`[dev] Reusing healthy Core at ${options.baseUrl}.`);
    return null;
  }

  options.logger.log('[dev] Starting Core...');
  const coreChild = options.spawnProcess(
    options.pnpmCommand,
    ['--filter', '@do-what/core', 'start'],
    { cwd: options.cwd, env: options.env },
  );
  options.onCoreProcessStarted?.(coreChild);
  const getCoreStatus = createChildMonitor(coreChild);

  await waitForCoreReady({
    baseUrl: options.baseUrl,
    fetchImpl: options.fetchImpl,
    getCoreStatus,
    intervalMs: options.intervalMs,
    now: options.now,
    sleep: options.sleep,
    timeoutMs: options.timeoutMs,
  });
  options.logger.log(`[dev] Core is healthy at ${options.baseUrl}.`);

  return coreChild;
}

function startApp(options) {
  options.logger.log('[dev] Starting App...');
  return options.spawnProcess(
    options.pnpmCommand,
    ['--filter', '@do-what/app', 'start'],
    { cwd: options.cwd, env: options.env },
  );
}

function createRuntimeState() {
  return {
    appChild: null,
    coreChild: null,
    coreStartedByScript: false,
    shuttingDown: false,
  };
}

function createCleanupChildren(state, options) {
  return async () => {
    if (state.appChild) {
      await stopChild(state.appChild, {
        graceMs: DEFAULT_SHUTDOWN_GRACE_MS,
        label: 'App',
        logger: options.logger,
        signal: 'SIGTERM',
        sleep: options.sleep,
      });
    }

    if (state.coreStartedByScript && state.coreChild) {
      await stopChild(state.coreChild, {
        graceMs: DEFAULT_SHUTDOWN_GRACE_MS,
        label: 'Core',
        logger: options.logger,
        signal: 'SIGTERM',
        sleep: options.sleep,
      });
    }
  };
}

function createSignalHandler(state, logger, cleanupChildren) {
  return (signal) => {
    if (state.shuttingDown) {
      return;
    }

    state.shuttingDown = true;
    logger.warn(`[dev] Received ${signal}. Shutting down...`);
    void cleanupChildren();
  };
}

async function finishSuccessfulRun(appExit, cleanupChildren, removeSignalHandlers, logger) {
  await cleanupChildren();
  removeSignalHandlers();

  if (appExit.signal) {
    logger.error(`[dev] App exited with ${describeExit(appExit)}.`);
    return 1;
  }

  return appExit.code ?? 0;
}

async function finishFailedRun(error, cleanupChildren, removeSignalHandlers, logger) {
  logger.error(error instanceof Error ? error.message : `[dev] ${String(error)}`);
  await cleanupChildren();
  removeSignalHandlers();
  return 1;
}

export async function runDevEntry(input = {}) {
  const env = input.env ?? process.env;
  const logger = input.logger ?? console;
  const platform = input.platform ?? process.platform;
  const sleep = input.sleep ?? defaultSleep;
  const signalHost = input.signalHost ?? process;
  const runtime = createRuntimeState();
  const options = {
    baseUrl: resolveCoreBaseUrl(env),
    cwd: input.cwd ?? process.cwd(),
    env,
    fetchImpl: input.fetchImpl ?? fetch,
    intervalMs: input.intervalMs ?? DEFAULT_HEALTH_INTERVAL_MS,
    logger,
    now: input.now ?? Date.now,
    pnpmCommand: resolvePnpmCommand(platform),
    sleep,
    spawnProcess: input.spawnProcess ?? spawnPnpmCommand,
    timeoutMs: input.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS,
  };
  const cleanupChildren = createCleanupChildren(runtime, { logger, sleep });
  const removeSignalHandlers = registerSignalHandlers(
    signalHost,
    createSignalHandler(runtime, logger, cleanupChildren),
  );

  try {
    runtime.coreChild = await startCoreIfNeeded({
      ...options,
      onCoreProcessStarted: (startedCoreChild) => {
        runtime.coreChild = startedCoreChild;
        runtime.coreStartedByScript = true;
      },
    });
    runtime.appChild = startApp(options);
    const appExit = await waitForChildExit(runtime.appChild);
    return finishSuccessfulRun(appExit, cleanupChildren, removeSignalHandlers, logger);
  } catch (error) {
    return finishFailedRun(error, cleanupChildren, removeSignalHandlers, logger);
  }
}

async function main() {
  const exitCode = await runDevEntry();
  process.exitCode = exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
