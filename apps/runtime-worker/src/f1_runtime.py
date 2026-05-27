from __future__ import annotations
import os, json, uuid
from datetime import datetime, UTC
import asyncpg
from .llm_provider import call_llm
from .tools.executor import execute_tool_call

async def run_f1_execution(execution_id:str, tenant_id:str, trace_id:str|None=None)->dict:
    dsn=os.environ.get('DATABASE_URL')
    if not dsn:
        raise RuntimeError('DATABASE_URL required')
    fake=os.environ.get('OCTO_TEST_LLM_FAKE','false').lower()=='true'
    conn=await asyncpg.connect(dsn)
    try:
      async with conn.transaction():
        row=await conn.fetchrow("SELECT id, state, version, input_json, context_snapshot_json FROM executions WHERE id=$1 AND tenant_id=$2",execution_id,tenant_id)
        if not row:
          raise RuntimeError('execution_not_found')
        if row['state']!='DISPATCHED':
          return {'status':'skipped','reason':'not_dispatched'}
        version=row['version']
        upd=await conn.execute("UPDATE executions SET state='RUNNING', status='running', version=version+1, started_at=now(), updated_at=now() WHERE id=$1 AND tenant_id=$2 AND state='DISPATCHED' AND version=$3",execution_id,tenant_id,version)
        if upd!='UPDATE 1':
          return {'status':'cas_conflict'}
        cp0=str(uuid.uuid4())
        await conn.execute("INSERT INTO execution_checkpoints (id,tenant_id,execution_id,step_index,source,parent_checkpoint_id,state_json,metadata_json,channel_versions,versions_seen,worker_id,schema_version) VALUES ($1,$2,$3,0,'input',NULL,$4::jsonb,$5::jsonb,'{}'::jsonb,'{}'::jsonb,$6,1)",cp0,tenant_id,execution_id,json.dumps({'messages':[{'role':'user','content':str(row['input_json'])}]}),json.dumps({'checkpoint_schema_version':1}),os.environ.get('HOSTNAME','runtime-worker'))
        llm_step_id = str(uuid.uuid4())
        await conn.execute("INSERT INTO execution_steps (id,tenant_id,execution_id,step_index,step_type,status,state_from,state_to,input_json,output_json) VALUES ($1,$2,$3,1,'llm_call','RUNNING','DISPATCHED','RUNNING',$4::jsonb,$5::jsonb)",llm_step_id,tenant_id,execution_id,json.dumps({'provider':'fake' if fake else 'litellm'}),json.dumps({}))
        await conn.execute("INSERT INTO outbox_events (id,tenant_id,aggregate_type,aggregate_id,event_type,sequence,payload_json) VALUES ($1,$2,'execution',$3,'ExecutionStarted',3,$4::jsonb)",str(uuid.uuid4()),tenant_id,execution_id,json.dumps({'executionId':execution_id,'traceId':trace_id}))
        messages=[{'role':'user','content':str(row['input_json'])}]
        llm = await call_llm(
          tenant_id=tenant_id,
          execution_id=execution_id,
          agent_id=str(row['id']),
          messages=messages,
          snapshot=(row['context_snapshot_json'] or {})
        )
        if llm.tool_calls:
          messages.append({'role':'assistant','content':'','tool_calls':llm.tool_calls})
          for idx, tc in enumerate(llm.tool_calls):
            tool_res = await execute_tool_call(conn, tenant_id=tenant_id, execution_id=execution_id, step_id=llm_step_id, step_index=idx+2, tool_call=tc, trace_id=trace_id)
            await conn.execute("INSERT INTO execution_checkpoint_writes (id,tenant_id,checkpoint_id,task_id,task_path,write_index,channel,type,value_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",str(uuid.uuid4()),tenant_id,cp0,execution_id,'tool',idx,'messages','tool_result',json.dumps(tool_res))
            messages.append({'role':'tool','content':json.dumps(tool_res), 'tool_call_id': tc.get('id')})
          llm2 = await call_llm(tenant_id=tenant_id, execution_id=execution_id, agent_id=str(row['id']), messages=messages, snapshot=(row['context_snapshot_json'] or {}))
          output = llm2.content
        else:
          output = llm.content
        await conn.execute("UPDATE execution_steps SET status='SUCCEEDED', output_json=$4::jsonb WHERE id=$1 AND tenant_id=$2 AND execution_id=$3", llm_step_id, tenant_id, execution_id, json.dumps({'llm_call': {'provider': llm.provider, 'model': llm.model, 'input_tokens': llm.usage.get('input_tokens', 0), 'output_tokens': llm.usage.get('output_tokens', 0), 'total_tokens': llm.usage.get('total_tokens', 0), 'estimated_cost_usd': str(llm.usage.get('estimated_cost_usd', '0')), 'latency_ms': llm.usage.get('latency_ms', 0), 'retry_count': llm.retry_count, 'fallback_level': llm.fallback_level, 'accounting_error': llm.accounting_error}}))
        cp1=str(uuid.uuid4())
        await conn.execute("INSERT INTO execution_checkpoints (id,tenant_id,execution_id,step_index,source,parent_checkpoint_id,state_json,metadata_json,channel_versions,versions_seen,worker_id,schema_version) VALUES ($1,$2,$3,2,'loop',$4,$5::jsonb,$6::jsonb,'{}'::jsonb,'{}'::jsonb,$7,1)",cp1,tenant_id,execution_id,cp0,json.dumps({'messages':[{'role':'assistant','content':output}]}),json.dumps({'checkpoint_schema_version':1}),os.environ.get('HOSTNAME','runtime-worker'))
        await conn.execute("UPDATE executions SET state='SUCCEEDED', status='completed', version=version+1, result=$4::jsonb, output_json=$4::jsonb, completed_at=now(), updated_at=now(), last_checkpoint_id=$3 WHERE id=$1 AND tenant_id=$2 AND state='RUNNING'",execution_id,tenant_id,cp1,json.dumps({'output':output}))
        await conn.execute("INSERT INTO outbox_events (id,tenant_id,aggregate_type,aggregate_id,event_type,sequence,payload_json) VALUES ($1,$2,'execution',$3,'ExecutionCheckpointed',4,$4::jsonb), ($5,$2,'execution',$3,'ExecutionSucceeded',5,$6::jsonb)",str(uuid.uuid4()),tenant_id,execution_id,json.dumps({'executionId':execution_id,'checkpointId':cp1}),str(uuid.uuid4()),json.dumps({'executionId':execution_id,'output':output}))
    finally:
      await conn.close()
    return {'status':'succeeded','output':output}
