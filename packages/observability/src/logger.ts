// Structured logger stub — integrate with Loki/OTEL log exporter
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

export function createLogger(service: string): Logger {
  const format = (level: string, message: string, context?: Record<string, unknown>): string =>
    JSON.stringify({ level, service, message, timestamp: new Date().toISOString(), ...context });

  return {
    info: (msg, ctx) => console.log(format('info', msg, ctx)),
    warn: (msg, ctx) => console.warn(format('warn', msg, ctx)),
    error: (msg, ctx) => console.error(format('error', msg, ctx)),
    debug: (msg, ctx) => console.log(format('debug', msg, ctx)),
  };
}
