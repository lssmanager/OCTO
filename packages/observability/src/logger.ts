import pino, { type Logger as PinoLogger } from 'pino';

export interface LoggerContext {
  service: string;
  version?: string;
}

/**
 * Infrastructure logger context.
 *
 * execution_id and agent_id are OPTIONAL because this interface is used
 * during bootstrap, health checks, and worker startup — contexts where
 * no job has been received yet and those fields genuinely do not exist.
 *
 * Use JobLoggerContext (below) inside any handler that processes a real job.
 */
export interface ExecutionLoggerContext {
  trace_id: string;
  execution_id?: string;
  agent_id?: string;
  run_id: string;
}

/**
 * Job handler logger context.
 *
 * All four fields are REQUIRED. Use this type in every TypeScript job
 * handler so TypeScript rejects the call at compile time if execution_id
 * or agent_id are absent from the incoming job payload.
 *
 * @example
 *   // In a BullMQ processor or any worker job handler:
 *   const log = createJobLogger(baseLogger, {
 *     trace_id: job.data.trace_id,
 *     run_id: job.data.run_id,
 *     execution_id: job.data.execution_id,
 *     agent_id: job.data.agent_id,
 *   });
 */
export interface JobLoggerContext {
  trace_id: string;
  execution_id: string; // required — must be present in every job payload
  agent_id: string;     // required — must be present in every job payload
  run_id: string;
}

export function createLogger(context: LoggerContext): PinoLogger {
  return pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    base: {
      service: context.service,
      version: context.version ?? '0.0.1-f0',
      env: process.env['NODE_ENV'] ?? 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    messageKey: 'msg',
  });
}

/**
 * Create a child logger for infrastructure / startup contexts.
 * execution_id and agent_id are optional in this context.
 */
export function createExecutionLogger(
  base: PinoLogger,
  context: ExecutionLoggerContext,
): PinoLogger {
  return base.child(context);
}

/**
 * Create a child logger for job handlers.
 * All context fields (including execution_id and agent_id) are required.
 * TypeScript will reject callers that omit either field at compile time.
 */
export function createJobLogger(
  base: PinoLogger,
  context: JobLoggerContext,
): PinoLogger {
  return base.child(context);
}
