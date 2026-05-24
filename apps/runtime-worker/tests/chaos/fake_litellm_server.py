from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
import asyncio

app = FastAPI()

@app.post('/v1/chat/completions')
async def chat_completions(request: Request):
    scenario = request.headers.get('x-octo-test-scenario')
    if scenario == 'timeout':
        await asyncio.sleep(3600)
    if scenario == 'rate_limit':
        return JSONResponse({'error': 'rate limit'}, status_code=429)
    if scenario == 'malformed':
        return Response('{bad json', media_type='application/json')
    if scenario == 'missing_usage':
        return JSONResponse({'id':'x','choices':[{'message':{'role':'assistant','content':'ok'},'finish_reason':'stop'}],'model':'openai/gpt-4.1-mini'})
    return JSONResponse({'id':'x','choices':[{'message':{'role':'assistant','content':'ok'},'finish_reason':'stop'}],'usage':{'prompt_tokens':1,'completion_tokens':1,'total_tokens':2},'model':'openai/gpt-4.1-mini'})
