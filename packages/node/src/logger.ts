import { createWriteStream, type WriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'node:util';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level?: LogLevel;
  logDir?: string;
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  close: () => void;
}

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let _globalLogger: Logger | undefined;

export function getGlobalLogger(): Logger {
  if (!_globalLogger) {
    _globalLogger = createLogger('info');
  }
  return _globalLogger;
}

export function setGlobalLogger(logger: Logger): void {
  _globalLogger = logger;
}

export function createLogger(levelOrOptions: LogLevel | LoggerOptions = 'info'): Logger {
  const opts = typeof levelOrOptions === 'string' ? { level: levelOrOptions } : levelOrOptions;
  const level = opts.level ?? 'info';
  const current = priorities[level];
  const shouldLog = (target: LogLevel): boolean => priorities[target] >= current;

  let fileStream: WriteStream | undefined;
  if (opts.logDir) {
    const logFile = resolve(opts.logDir, 'telagent.log');
    fileStream = createWriteStream(logFile, { flags: 'a' });
  }

  function writeToFile(logLevel: string, args: unknown[]): void {
    if (!fileStream) return;
    const ts = new Date().toISOString();
    const msg = format(...args);
    fileStream.write(`${ts} [${logLevel}] ${msg}\n`);
  }

  const logger: Logger = {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) {
        console.debug('[debug]', ...args);
        writeToFile('debug', args);
      }
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) {
        console.info('[info]', ...args);
        writeToFile('info', args);
      }
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn('[warn]', ...args);
        writeToFile('warn', args);
      }
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) {
        console.error('[error]', ...args);
        writeToFile('error', args);
      }
    },
    close: () => {
      fileStream?.end();
      fileStream = undefined;
    },
  };

  return logger;
}
