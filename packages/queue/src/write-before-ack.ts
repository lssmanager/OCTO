/**
 * packages/queue/src/write-before-ack.ts
 * H2 -- Write-Before-ACK Discipline
 *
 * INVARIANT: BullMQ ACK (auto-completion) MUST ONLY happen after
 * the durable DB write succeeds.
 *
 * BullMQ auto-ACK model:
 *   - Worker handler resolves -> BullMQ auto-ACKs (moveToCompleted)
 *   - Worker handler rejects  -> BullMQ auto-NAKs (moveToFailed)
 *   - NEVER call job.moveToCompleted() or job.moveToFailed() manually.
 *
 * RACE CONDITION ELIMINATED:
 *   BEFORE (forbidden):
 *     1. await job.moveToCompleted()   <- ACK
 *     2. await db.update(executions)   <- CRASH HERE = lost execution
 *
 *   AFTER (correct, enforced by this wrapper):
 *     1. await db.transaction(tx => { ...all writes... })  <- commit
 *     2. return result                                      <- handler resolves
 *     3. BullMQ auto-ACK                                   <- AFTER handler returns
 *
 * USAGE:
 *   const processor: Processor = async (job) => {
 *     return writeBeforeAck(db, job, async (tx) => {
 *       await stateService.transition(tx, id, 'running', 'completed', {...});
 *       return { success: true };
 *     });
 *   };
 *
 * FAILURE HANDLING:
 *   - DB transaction fails -> writeBeforeAck throws -> BullMQ retries job
 *   - Idempotency keys prevent duplication on retry
 *   - Execution never marked 'completed' without committed write
 *
 * AUDIT: searched entire repo for moveToCompleted, moveToFailed, job.updateProgress.
 * Result: zero manual ACK calls found. bullmq-adapter.ts uses Worker constructor
 * with processor callback (auto-ACK model). This file formalizes the contract.
 */

export interface TransactionalDb {
  transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T>;
}

/**
 * writeBeforeAck -- wraps a BullMQ job processor in a DB transaction.
 *
 * The callback receives the tx handle. All DB writes must happen inside.
 * Return value becomes the BullMQ job return value (triggers auto-ACK).
 *
 * @throws Re-throws any transaction error, causing BullMQ to retry the job.
 */
export async function writeBeforeAck<T>(
  db:      TransactionalDb,
  _job:    { id?: string },
  handler: (tx: unknown) => Promise<T>,
): Promise<T> {
  // Full sequence inside this transaction:
  //   checkpoint write
  //   -> execution_steps insert
  //   -> execution_events append
  //   -> execution status update (via ExecutionStateService.transition())
  //   -> transaction commit  <- BullMQ ACK only happens AFTER this line
  return db.transaction(handler);
}
