from __future__ import annotations
import asyncio, json, uuid, time
from jsonschema import validate, ValidationError
from .registry import ToolRegistry
from .policy import authorize_tool
from .errors import ToolError

registry = ToolRegistry()

async def execute_tool_call(conn, *, tenant_id: str, execution_id: str, step_id: str, step_index: int, tool_call: dict, trace_id: str|None):
    name = tool_call.get('name','')
    args_raw = tool_call.get('arguments_json') or '{}'
    try:
        args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
    except Exception:
        raise ToolError('TOOL_INPUT_INVALID','arguments_json is invalid',False)
    defn, fn = registry.resolve(name)
    decision, code = authorize_tool(defn, tenant_id)
    inv_id = str(uuid.uuid4())
    idem = f"{execution_id}:{step_index}:{name}:{tool_call.get('id','noid')}"
    if decision != 'allow':
        await conn.execute("INSERT INTO tool_invocations (id,tenant_id,execution_id,step_id,tool_name,status,args_json,error_code,error_message,idempotency_key,trace_id) VALUES ($1,$2,$3,$4,$5,'FAILED',$6::jsonb,$7,$8,$9,$10)",inv_id,tenant_id,execution_id,step_id,name,json.dumps(args),code,code,idem,trace_id)
        return {'type':'tool_result','tool_name':name,'status':'failed','error_code':code,'message':code,'retryable':False}

    await conn.execute("INSERT INTO tool_invocations (id,tenant_id,execution_id,step_id,tool_name,status,args_json,idempotency_key,trace_id) VALUES ($1,$2,$3,$4,$5,'RUNNING',$6::jsonb,$7,$8)",inv_id,tenant_id,execution_id,step_id,name,json.dumps(args),idem,trace_id)
    try:
        validate(instance=args, schema=defn.input_schema)
    except ValidationError as e:
        await conn.execute("UPDATE tool_invocations SET status='FAILED', error_code='TOOL_INPUT_INVALID', error_message=$2, ended_at=now() WHERE id=$1", inv_id, str(e))
        return {'type':'tool_result','tool_name':name,'status':'failed','error_code':'TOOL_INPUT_INVALID','message':str(e),'retryable':False}

    start = time.perf_counter()
    try:
        result = await asyncio.wait_for(asyncio.to_thread(fn, args), timeout=defn.timeout_ms/1000)
    except asyncio.TimeoutError:
        await conn.execute("UPDATE tool_invocations SET status='TIMED_OUT', error_code='TOOL_TIMEOUT', error_message='tool timeout', ended_at=now() WHERE id=$1", inv_id)
        return {'type':'tool_result','tool_name':name,'status':'failed','error_code':'TOOL_TIMEOUT','message':'tool timeout','retryable':True}

    try:
        validate(instance=result, schema=defn.output_schema)
    except ValidationError as e:
        await conn.execute("UPDATE tool_invocations SET status='FAILED', error_code='TOOL_OUTPUT_INVALID', error_message=$2, output=$3::jsonb, ended_at=now() WHERE id=$1", inv_id, str(e), json.dumps(result))
        return {'type':'tool_result','tool_name':name,'status':'failed','error_code':'TOOL_OUTPUT_INVALID','message':str(e),'retryable':False}

    duration = int((time.perf_counter()-start)*1000)
    await conn.execute("UPDATE tool_invocations SET status='SUCCEEDED', output=$2::jsonb, result_json=$2::jsonb, duration_ms=$3, ended_at=now(), completed_at=now() WHERE id=$1",inv_id,json.dumps(result),duration)
    return {'type':'tool_result','tool_name':name,'status':'succeeded','result':result}
