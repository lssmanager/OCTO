// packages/runtime-state/src/execution-state.service.spec.ts
// F0: Execution state machine unit tests (E4).
//
// Tests:
//  - transition(PENDING → RUNNING) with successful CAS
//  - transition() throws ConcurrentTransitionError when CAS loses the race
//  - transition() throws InvalidTransitionError for illegal FSM edges
//
// Uses Vitest. Mocks StateServiceDeps — no real Postgres needed.

import { describe, it, expect, vi } from 'vitest';
import { ExecutionStateService, type StateServiceDeps } from './execution-state.service';
import { ConcurrentTransitionError } from './errors';
import { InvalidTransitionError } from './transitions';

// ── Test helpers ──────────────────────────────────────────────────────────

function mockDeps(overrides?: Partial<StateServiceDeps>): StateServiceDeps {
  return {
    updateExecutionStatus: vi.fn().mockResolvedValue(true), // CAS wins by default
    appendExecutionEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const EXEC_ID = '00000000-0000-0000-0000-000000000001';

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ExecutionStateService', () => {
  describe('transition() — CAS success', () => {
    it('PENDING → QUEUED succeeds when CAS wins', async () => {
      const deps = mockDeps();
      const svc = new ExecutionStateService(deps);
      const tx = {};

      await svc.transition(tx, EXEC_ID, 'pending', 'queued');

      expect(deps.updateExecutionStatus).toHaveBeenCalledWith(
        tx, EXEC_ID, 'pending', 'queued', {},
      );
      expect(deps.appendExecutionEvent).toHaveBeenCalled();
    });

    it('RUNNING → COMPLETED succeeds when CAS wins', async () => {
      const deps = mockDeps();
      const svc = new ExecutionStateService(deps);

      await svc.transition({}, EXEC_ID, 'running', 'completed');

      expect(deps.updateExecutionStatus).toHaveBeenCalledWith(
        {}, EXEC_ID, 'running', 'completed', {},
      );
    });

    it('Idempotency: from === to returns early (no-op)', async () => {
      const deps = mockDeps();
      const svc = new ExecutionStateService(deps);

      await svc.transition({}, EXEC_ID, 'pending', 'pending');

      // No DB call should be made
      expect(deps.updateExecutionStatus).not.toHaveBeenCalled();
      expect(deps.appendExecutionEvent).not.toHaveBeenCalled();
    });
  });

  // ── CAS lost — ConcurrentTransitionError ──────────────────────────────

  describe('transition() — CAS conflict', () => {
    it('throws ConcurrentTransitionError when updateExecutionStatus returns false', async () => {
      const deps = mockDeps({
        updateExecutionStatus: vi.fn().mockResolvedValue(false), // CAS lost
      });
      const svc = new ExecutionStateService(deps);

      await expect(
        svc.transition({}, EXEC_ID, 'pending', 'queued'),
      ).rejects.toThrow(ConcurrentTransitionError);

      // Event must NOT be appended when CAS is lost
      expect(deps.appendExecutionEvent).not.toHaveBeenCalled();
    });

    it('ConcurrentTransitionError includes executionId', async () => {
      const deps = mockDeps({
        updateExecutionStatus: vi.fn().mockResolvedValue(false),
      });
      const svc = new ExecutionStateService(deps);

      try {
        await svc.transition({}, EXEC_ID, 'running', 'completed');
        expect.unreachable('Expected ConcurrentTransitionError');
      } catch (err) {
        expect(err).toBeInstanceOf(ConcurrentTransitionError);
        expect((err as ConcurrentTransitionError).executionId).toBe(EXEC_ID);
        expect((err as ConcurrentTransitionError).expectedStatus).toBe('running');
        expect((err as ConcurrentTransitionError).attemptedStatus).toBe('completed');
      }
    });
  });

  // ── Invalid FSM transition ─────────────────────────────────────────────

  describe('transition() — invalid FSM edges', () => {
    it('throws when transitioning from a terminal state (COMPLETED → RUNNING)', async () => {
      const deps = mockDeps();
      const svc = new ExecutionStateService(deps);

      await expect(
        svc.transition({}, EXEC_ID, 'completed', 'running'),
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('throws when transitioning from a terminal state (FAILED → RUNNING)', async () => {
      const deps = mockDeps();
      const svc = new ExecutionStateService(deps);

      await expect(
        svc.transition({}, EXEC_ID, 'failed', 'running'),
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('throws for illegal edge (PENDING → COMPLETED — skips queue)', async () => {
      const deps = mockDeps();
      const svc = new ExecutionStateService(deps);

      await expect(
        svc.transition({}, EXEC_ID, 'pending', 'completed'),
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('error message describes allowed transitions from current state', async () => {
      const deps = mockDeps();
      const svc = new ExecutionStateService(deps);

      try {
        await svc.transition({}, EXEC_ID, 'pending', 'running');
        expect.unreachable('Expected InvalidTransitionError');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain('Invalid transition pending -> running');
        expect(msg).toContain(EXEC_ID);
        expect(msg).toContain('queued');
      }
    });
  });

  // ── Terminal detection ─────────────────────────────────────────────────

  describe('isTerminal()', () => {
    it('returns true for completed, failed, cancelled', () => {
      const svc = new ExecutionStateService(mockDeps());
      expect(svc.isTerminal('completed')).toBe(true);
      expect(svc.isTerminal('failed')).toBe(true);
      expect(svc.isTerminal('cancelled')).toBe(true);
    });

    it('returns false for active states', () => {
      const svc = new ExecutionStateService(mockDeps());
      expect(svc.isTerminal('pending')).toBe(false);
      expect(svc.isTerminal('running')).toBe(false);
      expect(svc.isTerminal('queued')).toBe(false);
    });
  });
});
