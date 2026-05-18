// packages/observability/src/db-instrumentation.ts
// Fix 6 — OTel instrumentation for Drizzle ORM queries.
//
// Drizzle doesn't have an official OTel plugin, but it exposes a
// logger interface. We implement it to emit spans for every DB query.
//
// Usage in packages/database/src/client.ts:
//   import { createInstrumentedDrizzle } from '@octo/observability';
//   export const db = createInstrumentedDrizzle(sql, schema);
//
// Span attributes follow OTel DB Semantic Conventions:
// https://opentelemetry.io/docs/specs/semconv/database/sql/

import { SpanKind, SpanStatusCode, context, trace } from '@opentelemetry/api';
import { getOctoTracer } from './tracer';
import type { Logger } from 'drizzle-orm';

/**
 * OTel-aware Drizzle logger.
 * Pass to drizzle({ logger: new OtelDrizzleLogger() }).
 *
 * Because Drizzle's logger.logQuery() is synchronous and called
 * after the query completes (not before), we create an already-ended
 * span for the query duration. This provides SQL statement visibility
 * in Grafana traces without requiring async query interception.
 *
 * For full before/after timing, use a postgres.js interceptor instead
 * (see packages/database/src/client.ts for the recommended approach).
 */
export class OtelDrizzleLogger implements Logger {
  private readonly dbSystem: string;
  private readonly dbName: string;

  constructor(dbSystem = 'postgresql', dbName = 'octo') {
    this.dbSystem = dbSystem;
    this.dbName   = dbName;
  }

  logQuery(query: string, params: unknown[]): void {
    const tracer = getOctoTracer();
    const span   = tracer.startSpan(
      'db.query',
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'db.system':     this.dbSystem,
          'db.name':       this.dbName,
          'db.statement':  query.substring(0, 1000), // truncate to avoid huge spans
          'db.params.count': params.length,
        },
      },
      context.active(),
    );
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }
}

/**
 * postgres.js interceptor for full timing instrumentation.
 * Wraps every SQL query in an OTel span with accurate duration.
 *
 * Usage:
 *   import postgres from 'postgres';
 *   import { createPostgresInterceptor } from '@octo/observability';
 *   const sql = postgres(DATABASE_URL, { transform: createPostgresInterceptor() });
 *
 * This is the preferred approach for production — gives real latency data.
 */
export function createPostgresInterceptor() {
  const tracer = getOctoTracer();

  return {
    // postgres.js query hook — called with each query before execution.
    // We use a closure to capture span start time.
    query(originalQuery: {
      string: string;
      parameters: unknown[];
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    }) {
      const span = tracer.startSpan(
        'db.query',
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'db.system':    'postgresql',
            'db.name':      'octo',
            'db.statement': originalQuery.string.substring(0, 1000),
            'db.params.count': originalQuery.parameters.length,
          },
        },
        context.active(),
      );

      const originalResolve = originalQuery.resolve;
      const originalReject  = originalQuery.reject;

      originalQuery.resolve = (value: unknown) => {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        originalResolve(value);
      };

      originalQuery.reject = (reason: unknown) => {
        span.recordException(reason as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(reason) });
        span.end();
        originalReject(reason);
      };
    },
  };
}

/**
 * Re-export for convenience — single import from @octo/observability.
 */
export { trace, context };
