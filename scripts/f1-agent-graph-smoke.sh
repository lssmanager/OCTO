#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3001/api}"
API_URL="${API_URL%/}"
JWT_SECRET="${JWT_SECRET:-dev-secret}"
JWT_KID="${JWT_KID:-dev-hs256}"
TENANT_ID="${F1_AGENT_GRAPH_SMOKE_TENANT_ID:-tenant-f1-agent-graph-smoke}"
USER_ID="${F1_AGENT_GRAPH_SMOKE_USER_ID:-user-f1-agent-graph-smoke}"
OTHER_TENANT_ID="${F1_AGENT_GRAPH_SMOKE_OTHER_TENANT_ID:-tenant-f1-agent-graph-other}"

make_token() {
  local tenant_id="$1"
  local user_id="$2"
  JWT_SECRET="$JWT_SECRET" JWT_KID="$JWT_KID" TENANT_ID="$tenant_id" USER_ID="$user_id" node - <<'NODE'
const crypto = require('crypto');
const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = enc({ alg: 'HS256', typ: 'JWT', kid: process.env.JWT_KID });
const payload = enc({
  sub: process.env.USER_ID,
  tenant_id: process.env.TENANT_ID,
  roles: ['tenant_admin'],
  scopes: ['agents:read', 'agents:write'],
  iss: 'octo-f1-agent-graph-smoke',
  aud: 'octo-api',
  iat: now,
  exp: now + 3600,
  jti: crypto.randomUUID(),
});
const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
process.stdout.write(`${header}.${payload}.${sig}`);
NODE
}

TOKEN="$(make_token "$TENANT_ID" "$USER_ID")"
OTHER_TOKEN="$(make_token "$OTHER_TENANT_ID" "${USER_ID}-other")"
RUN_ID="$(date +%s)-$$"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

post_json() {
  curl -fsS -X POST "$API_URL$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "$2"
}
get_json() {
  curl -fsS "$API_URL$1" -H "authorization: Bearer $TOKEN"
}
json_field() {
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(data${2});" "$1"
}
expect_status() {
  local expected="$1"
  local method="$2"
  local path="$3"
  local token="$4"
  local body="${5:-}"
  local status
  if [[ -n "$body" ]]; then
    status="$(curl -sS -o "$tmp/expect.json" -w '%{http_code}' -X "$method" "$API_URL$path" -H "authorization: Bearer $token" -H 'content-type: application/json' --data "$body")"
  elif [[ -n "$token" ]]; then
    status="$(curl -sS -o "$tmp/expect.json" -w '%{http_code}' -X "$method" "$API_URL$path" -H "authorization: Bearer $token")"
  else
    status="$(curl -sS -o "$tmp/expect.json" -w '%{http_code}' -X "$method" "$API_URL$path" -H 'content-type: application/json' --data '{}')"
  fi
  if [[ "$status" != "$expected" ]]; then
    echo "Expected HTTP $expected for $method $path, got $status" >&2
    cat "$tmp/expect.json" >&2 || true
    exit 1
  fi
}

echo "F1 Agent Graph smoke: validating CRUD hierarchy against $API_URL for tenant $TENANT_ID"

expect_status 401 POST /v1/agents/nodes ''

post_json /v1/agents/nodes "{\"name\":\"F1 Smoke Agency ${RUN_ID}\",\"level\":\"agency\"}" > "$tmp/agency.json"
agency_id="$(json_field "$tmp/agency.json" '.id')"

expect_status 400 POST /v1/agents/nodes "$TOKEN" "{\"name\":\"Invalid Workspace ${RUN_ID}\",\"level\":\"workspace\",\"parentId\":\"$agency_id\"}"
expect_status 404 GET "/v1/agents/nodes/$agency_id" "$OTHER_TOKEN"

post_json /v1/agents/nodes "{\"name\":\"F1 Smoke Department ${RUN_ID}\",\"level\":\"department\",\"parentId\":\"$agency_id\"}" > "$tmp/department.json"
department_id="$(json_field "$tmp/department.json" '.id')"
post_json /v1/agents/nodes "{\"name\":\"F1 Smoke Workspace ${RUN_ID}\",\"level\":\"workspace\",\"parentId\":\"$department_id\"}" > "$tmp/workspace.json"
workspace_id="$(json_field "$tmp/workspace.json" '.id')"
post_json /v1/agents "{\"name\":\"F1 Smoke Agent ${RUN_ID}\",\"role\":\"operator\",\"goal\":\"verify F1 agent graph\",\"hierarchyLevel\":\"agent\",\"hierarchyParentId\":\"$workspace_id\",\"capabilities\":[\"graph.smoke\"]}" > "$tmp/agent.json"
agent_id="$(json_field "$tmp/agent.json" '.id')"
get_json /v1/agents/graph > "$tmp/graph.json"
node - <<'NODE' "$tmp/graph.json" "$agency_id" "$department_id" "$workspace_id" "$agent_id"
const fs = require('fs');
const graph = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const [agencyId, departmentId, workspaceId, agentId] = process.argv.slice(3);
const flat = [];
const walk = (nodes) => nodes.forEach((node) => { flat.push(node); walk(node.children || []); });
walk(graph);
const agency = flat.find((node) => node.id === agencyId && node.level === 'agency');
const department = flat.find((node) => node.id === departmentId && node.parentId === agencyId && node.level === 'department');
const workspace = flat.find((node) => node.id === workspaceId && node.parentId === departmentId && node.level === 'workspace');
const agentNode = flat.find((node) => node.agent && node.agent.id === agentId);
if (!agency || !department || !workspace) throw new Error('F1 Agent Graph smoke did not persist Agency → Department → Workspace');
if (!agentNode || agentNode.parentId !== workspaceId) throw new Error('F1 Agent Graph smoke did not persist Workspace → Agent relationship');
if (!JSON.stringify(agentNode.effectiveCapabilities || []).includes('graph.smoke')) throw new Error('F1 Agent Graph smoke did not expose capabilities');
console.log(`F1 Agent Graph smoke passed: ${agentId} under ${workspaceId}`);
NODE
