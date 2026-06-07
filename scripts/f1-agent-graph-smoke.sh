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
  local secret="${3:-$JWT_SECRET}"
  local kid="${4:-$JWT_KID}"
  local scopes_json="${5:-[\"agents:read\",\"agents:write\"]}"
  JWT_SECRET="$secret" JWT_KID="$kid" TENANT_ID="$tenant_id" USER_ID="$user_id" SCOPES_JSON="$scopes_json" node - <<'NODE'
const crypto = require('crypto');
const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = enc({ alg: 'HS256', typ: 'JWT', kid: process.env.JWT_KID });
const payload = enc({
  sub: process.env.USER_ID,
  tenant_id: process.env.TENANT_ID,
  roles: ['tenant_admin'],
  scopes: JSON.parse(process.env.SCOPES_JSON || '[]'),
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
UNKNOWN_KID_TOKEN="$(make_token "$TENANT_ID" "${USER_ID}-unknown-kid" "$JWT_SECRET" "${JWT_KID}-missing")"
WRONG_SECRET_TOKEN="$(make_token "$TENANT_ID" "${USER_ID}-wrong-secret" "${JWT_SECRET}-wrong" "$JWT_KID")"
NO_SCOPE_TOKEN="$(make_token "$TENANT_ID" "${USER_ID}-no-scope" "$JWT_SECRET" "$JWT_KID" '[]')"
RUN_ID="$(date +%s)-$$"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

post_json() {
  curl -fsS -X POST "$API_URL$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "$2"
}
patch_json() {
  curl -fsS -X PATCH "$API_URL$1" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data "$2"
}
delete_json() {
  curl -fsS -X DELETE "$API_URL$1" -H "authorization: Bearer $TOKEN"
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
expect_status 401 POST /v1/agents/nodes "$UNKNOWN_KID_TOKEN" '{"name":"Invalid Kid","level":"agency"}'
expect_status 401 POST /v1/agents/nodes "$WRONG_SECRET_TOKEN" '{"name":"Wrong Secret","level":"agency"}'
expect_status 403 GET /v1/agents/graph "$NO_SCOPE_TOKEN"

post_json /v1/agents/nodes "{\"name\":\"F1 Smoke Agency ${RUN_ID}\",\"level\":\"agency\",\"capabilities\":[\"smoke.agency\"],\"toolPolicy\":{\"allow\":[\"builtin.echo\",\"danger.tool\"]}}" > "$tmp/agency.json"
agency_id="$(json_field "$tmp/agency.json" '.id')"

expect_status 400 POST /v1/agents/nodes "$TOKEN" "{\"name\":\"Invalid Workspace ${RUN_ID}\",\"level\":\"workspace\",\"parentId\":\"$agency_id\"}"
expect_status 400 POST /v1/agents/nodes "$TOKEN" "{\"name\":\"Invalid Agent Node ${RUN_ID}\",\"level\":\"agent\",\"parentId\":\"$agency_id\"}"
expect_status 404 GET "/v1/agents/nodes/$agency_id" "$OTHER_TOKEN"

post_json /v1/agents/nodes "{\"name\":\"F1 Smoke Department ${RUN_ID}\",\"level\":\"department\",\"parentId\":\"$agency_id\",\"capabilities\":[\"smoke.department\"],\"toolPolicy\":{\"deny\":[\"danger.tool\"]}}" > "$tmp/department.json"
department_id="$(json_field "$tmp/department.json" '.id')"
post_json /v1/agents/nodes "{\"name\":\"F1 Smoke Workspace ${RUN_ID}\",\"level\":\"workspace\",\"parentId\":\"$department_id\",\"budgetPolicy\":{\"maxUsdPerRun\":\"0.10\"},\"capabilities\":[\"smoke.workspace\"]}" > "$tmp/workspace.json"
workspace_id="$(json_field "$tmp/workspace.json" '.id')"
post_json /v1/agents "{\"name\":\"F1 Smoke Agent ${RUN_ID}\",\"role\":\"operator\",\"goal\":\"verify F1 agent graph\",\"hierarchyLevel\":\"agent\",\"hierarchyParentId\":\"$workspace_id\",\"capabilities\":[\"graph.smoke\"]}" > "$tmp/agent.json"
agent_id="$(json_field "$tmp/agent.json" '.id')"
get_json "/v1/agents/nodes/$workspace_id" > "$tmp/workspace-detail.json"
get_json /v1/agents/graph > "$tmp/graph-inheritance.json"
node - <<'NODE' "$tmp/graph-inheritance.json" "$agent_id"
const fs = require('fs');
const graph = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const agentId = process.argv[3];
const flat = [];
const walk = (nodes) => nodes.forEach((node) => { flat.push(node); walk(node.children || []); });
walk(graph);
const agentNode = flat.find((node) => node.agent && node.agent.id === agentId);
const caps = agentNode?.effectiveCapabilities || [];
for (const cap of ['smoke.agency', 'smoke.department', 'smoke.workspace', 'graph.smoke']) {
  if (!caps.includes(cap)) throw new Error(`F1 smoke missing inherited capability ${cap}`);
}
const toolPolicy = agentNode?.effectivePolicies?.toolPolicy || {};
if (!toolPolicy.allow?.includes('builtin.echo') || toolPolicy.allow?.includes('danger.tool') || !toolPolicy.deny?.includes('danger.tool')) {
  throw new Error('F1 smoke effective toolPolicy did not preserve inherited allow/deny semantics');
}
NODE

patch_json "/v1/agents/nodes/$workspace_id" "{\"name\":\"F1 Smoke Workspace Patched ${RUN_ID}\",\"activationState\":\"inactive\",\"modelPolicy\":{\"primaryModel\":\"smoke/model\"},\"toolPolicy\":{\"allow\":[\"builtin.echo\"]}}" > "$tmp/workspace-patched.json"
node - <<'NODE' "$tmp/workspace-patched.json"
const fs = require('fs');
const workspace = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (workspace.name.indexOf('Patched') === -1 || workspace.activationState !== 'inactive') throw new Error('F1 smoke patch node did not update name/activationState');
if (workspace.localPolicies?.modelPolicy?.primaryModel !== 'smoke/model') throw new Error('F1 smoke patch node did not update modelPolicy');
NODE
patch_json "/v1/agents/nodes/$workspace_id" '{"activationState":"active"}' > /dev/null
expect_status 400 PATCH "/v1/agents/nodes/$workspace_id" "$TOKEN" '{"activationState":"deleted"}'

post_json /v1/agents/nodes "{\"name\":\"F1 Smoke Second Agency ${RUN_ID}\",\"level\":\"agency\"}" > "$tmp/agency2.json"
agency2_id="$(json_field "$tmp/agency2.json" '.id')"
post_json /v1/agents/nodes "{\"name\":\"F1 Smoke Second Department ${RUN_ID}\",\"level\":\"department\",\"parentId\":\"$agency2_id\"}" > "$tmp/department2.json"
department2_id="$(json_field "$tmp/department2.json" '.id')"
post_json /v1/agents/nodes "{\"name\":\"F1 Smoke Workspace Reparent Target ${RUN_ID}\",\"level\":\"workspace\",\"parentId\":\"$department2_id\"}" > "$tmp/workspace2.json"
workspace2_id="$(json_field "$tmp/workspace2.json" '.id')"
get_json /v1/agents/graph > "$tmp/graph-before-reparent.json"
agent_node_id="$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); function flat(nodes){return nodes.flatMap(n=>[n,...flat(n.children||[])]);} console.log(flat(data).find(n=>n.agent&&n.agent.id===process.argv[2]).id);" "$tmp/graph-before-reparent.json" "$agent_id")"
patch_json "/v1/agents/nodes/$department_id/parent" "{\"parentId\":\"$agency2_id\"}" > "$tmp/reparent-department.json"
expect_status 400 PATCH "/v1/agents/nodes/$department_id/parent" "$TOKEN" "{\"parentId\":\"$workspace_id\"}"
patch_json "/v1/agents/nodes/$workspace_id/parent" "{\"parentId\":\"$department2_id\"}" > "$tmp/reparent-workspace.json"
patch_json "/v1/agents/nodes/$agent_node_id/parent" "{\"parentId\":\"$workspace2_id\"}" > "$tmp/reparent-agent.json"
expect_status 400 PATCH "/v1/agents/nodes/$agent_node_id/parent" "$TOKEN" "{\"parentId\":\"$department_id\"}"
expect_status 400 PATCH "/v1/agents/nodes/$department_id/parent" "$TOKEN" "{\"parentId\":\"$department_id\"}"
expect_status 404 PATCH "/v1/agents/nodes/$department_id/parent" "$TOKEN" '{"parentId":"missing-parent"}'
expect_status 404 PATCH "/v1/agents/nodes/$department_id/parent" "$OTHER_TOKEN" "{\"parentId\":\"$agency_id\"}"

patch_json "/v1/agents/$agent_id" '{"name":"F1 Smoke Agent Patched","role":"reviewer","goal":"verify patch","status":"active","capabilities":["graph.smoke","graph.patch"]}' > "$tmp/agent-patched.json"
patch_json "/v1/agents/nodes/$workspace_id" '{"activationState":"archived"}' > /dev/null
patch_json "/v1/agents/nodes/$workspace_id" '{"activationState":"active"}' > /dev/null

get_json /v1/agents/graph > "$tmp/graph.json"
node - <<'NODE' "$tmp/graph.json" "$agency_id" "$agency2_id" "$department_id" "$department2_id" "$workspace_id" "$workspace2_id" "$agent_id"
const fs = require('fs');
const graph = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const [agencyId, agency2Id, departmentId, department2Id, workspaceId, workspace2Id, agentId] = process.argv.slice(3);
const flat = [];
const walk = (nodes) => nodes.forEach((node) => { flat.push(node); walk(node.children || []); });
walk(graph);
const agency = flat.find((node) => node.id === agencyId && node.level === 'agency');
const department = flat.find((node) => node.id === departmentId && node.parentId === agency2Id && node.level === 'department');
const department2 = flat.find((node) => node.id === department2Id && node.parentId === agency2Id && node.level === 'department');
const workspace = flat.find((node) => node.id === workspaceId && node.parentId === department2Id && node.level === 'workspace');
const workspace2 = flat.find((node) => node.id === workspace2Id && node.parentId === department2Id && node.level === 'workspace');
const agentNode = flat.find((node) => node.agent && node.agent.id === agentId);
if (!agency || !department || !department2 || !workspace || !workspace2) throw new Error('F1 Agent Graph smoke did not persist Agency → Department → Workspace and valid reparent paths');
if (!agentNode || agentNode.parentId !== workspace2Id) throw new Error('F1 Agent Graph smoke did not persist valid Workspace → Agent reparent');
if (agentNode.agent.name !== 'F1 Smoke Agent Patched') throw new Error('F1 Agent Graph smoke did not patch agent fields');
if (!JSON.stringify(agentNode.effectiveCapabilities || []).includes('graph.patch')) throw new Error('F1 Agent Graph smoke did not expose patched capabilities');
console.log(`F1 Agent Graph smoke CRUD paths passed: ${agentId} under ${workspace2Id}`);
NODE

delete_json "/v1/agents/$agent_id" > "$tmp/agent-delete.json"
expect_status 404 GET "/v1/agents/nodes/$agent_node_id" "$TOKEN"
