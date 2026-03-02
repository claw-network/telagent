export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(level: LogLevel = 'info') {
  const current = priorities[level];

  const shouldLog = (target: LogLevel): boolean => priorities[target] >= current;

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) console.debug('[debug]', ...args);
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) console.info('[info]', ...args);
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) console.warn('[warn]', ...args);
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) console.error('[error]', ...args);
    },
  };
}
