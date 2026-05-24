# LiteLLM Proxy Operations (OCTO F1)

LiteLLM Proxy is the single provider gateway for runtime-worker. Runtime core must not use vendor SDKs directly.

## Required env
- `LITELLM_MASTER_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

## Example config
```yaml
model_list:
  - model_name: gpt-4.1-mini
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: ${OPENAI_API_KEY}
litellm_settings:
  drop_params: true
  telemetry: false
general_settings:
  master_key: ${LITELLM_MASTER_KEY}
```

## Health
`curl http://localhost:4000/health/liveliness`
