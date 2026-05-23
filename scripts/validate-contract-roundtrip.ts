import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import * as contracts from '../packages/contracts/dist/index.mjs';

const ajv = new Ajv({ allErrors: true, strict: false } as any);
const load = (n: string) => JSON.parse(readFileSync(`packages/contracts/generated/json-schema/${n}.json`, 'utf-8'));
const check = (name: string, zodSchema: any, payload: any) => {
  zodSchema.parse(payload);
  const schema = load(name);
  const validate = ajv.compile(schema as any);
  if (!validate(payload)) throw new Error(`${name} JSON Schema failed: ${ajv.errorsText(validate.errors)}`);
};

check('ExecutionSchema', (contracts as any).ExecutionSchema, { id:'e1',tenantId:'t1',agentId:'a1',agentVersionId:'av1',state:'RUNNING',version:1,inputJson:{},attemptCount:0,reclaimCount:0,createdBy:'u',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z' });
check('ExecutionCheckpointSchema', (contracts as any).ExecutionCheckpointSchema, { id:'c1',executionId:'e1',tenantId:'t1',stepIndex:1,source:'tool',stateJson:{},channelVersions:{ch:1},versionsSeen:{ch:{a:1}},metadataJson:{},createdAt:'2026-01-01T00:00:00Z' });
check('ToolInvocationSchema', (contracts as any).ToolInvocationSchema, { id:'ti1',tenantId:'t1',executionId:'e1',stepId:'s1',toolName:'search',toolKind:'builtin_sync',status:'PENDING',argsJson:{},requiresApproval:false,idempotencyKey:'id1',startedAt:'2026-01-01T00:00:00Z' });
check('OutboxEventSchema', (contracts as any).OutboxEventSchema, { id:'o1',tenantId:'t1',aggregateType:'execution',aggregateId:'e1',eventType:'ExecutionQueued',sequence:1,payloadJson:{},createdAt:'2026-01-01T00:00:00Z' });
console.log('Roundtrip TS->JSON Schema validation passed');
