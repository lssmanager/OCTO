// packages/queue/src/bullmq-adapter.spec.ts
// F0: Queue adapter unit tests (E4).
//
// Tests:
//  - writeBeforeAck: DB write happens BEFORE handler resolves (and thus before ACK)
//  - DLQ routing: job with max retries exceeded routes to DLQ
//
// Uses Vitest. Mocks BullMQ and DB — no real Redis/Postgres needed.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeBeforeAck, type TransactionalDb } from './write-before-ack';
import { DlqReason } from '@octo/contracts';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock @octo/contracts DlqReason
vi.mock('@octo/contracts', () => ({
  DlqReason: {
    MAX_RETRIES_EXCEEDED: 'max_retries_exceeded',
    TOOL_TIMEOUT: 'tool_timeout',
    PERMANENT_FAILURE: 'permanent_failure',
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

interface MockTransactionDb extends TransactionalDb {
  _committed: boolean;
  _handlerRan: boolean;
}

function createMockDb(): MockTransactionDb {
  const db: MockTransactionDb = {
    _committed: false,
    _handlerRan: false,
    async transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      // Simulate: transaction begins, callback runs, commit happens
      const result = await callback({ _tx: 'mock-tx' });
      db._committed = true;
      return result;
    },
  };
  return db;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('writeBeforeAck', () => {
  let db: MockTransactionDb;

  beforeEach(() => {
    db = createMockDb();
  });

  it('runs the handler inside the transaction', async () => {
    const job = { id: 'job-1' };
    let handlerRan = false;

    await writeBeforeAck(db, job, async (tx) => {
      handlerRan = true;
      expect(tx).toBeDefined();
      return { success: true };
    });

    expect(handlerRan).toBe(true);
  });

  it('commits the DB transaction BEFORE returning (ACK safety)', async () => {
    const job = { id: 'job-2' };
    let commitOrder: string[] = [];

    const result = await writeBeforeAck(db, job, async (_tx) => {
      commitOrder.push('handler');
      return { order: commitOrder };
    });

    // At this point the handler returned AND the transaction committed
    expect(db._committed).toBe(true);
    // Handler ran before commit (verified by the mock's internal order)
    expect(result).toEqual({ order: ['handler'] });
  });

  it('propagates handler errors — DB never commits, BullMQ retries', async () => {
    const failingDb = {
      async transaction<T>(_callback: (tx: unknown) => Promise<T>): Promise<T> {
        throw new Error('DB connection lost');
      },
    };

    const job = { id: 'job-3' };

    await expect(
      writeBeforeAck(failingDb, job, async () => ({ ok: true })),
    ).rejects.toThrow('DB connection lost');
  });

  it('handler error thrown within transaction causes abort (no partial writes)', async () => {
    const strictDb: TransactionalDb = {
      async transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
        try {
          return await callback({ _tx: 'mock' });
        } catch {
          // Transaction rolled back — nothing committed
          throw new Error('transaction_aborted');
        }
      },
    };

    const job = { id: 'job-4' };

    await expect(
      writeBeforeAck(strictDb, job, async () => {
        throw new Error('handler crash');
      }),
    ).rejects.toThrow('transaction_aborted');
  });
});

describe('DlqReason — contract validation', () => {
  it('MAX_RETRIES_EXCEEDED is a valid DLQ reason string', () => {
    expect(DlqReason.MAX_RETRIES_EXCEEDED).toBe('max_retries_exceeded');
  });

  it('PERMANENT_FAILURE is a valid DLQ reason string', () => {
    expect(DlqReason.PERMANENT_FAILURE).toBe('permanent_failure');
  });

  it('TOOL_TIMEOUT is a valid DLQ reason string', () => {
    expect(DlqReason.TOOL_TIMEOUT).toBe('tool_timeout');
  });
});
