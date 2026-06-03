#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3001}"
JWT_SECRET="${JWT_SECRET:-dev-secret}"
JWT_KID="${JWT_KID:-dev-hs256}"
TENANT_ID="${F2_SMOKE_TENANT_ID:-tenant-f2-smoke}"
USER_ID="${F2_SMOKE_USER_ID:-user-f2-smoke}"

token() {
  JWT_SECRET="$JWT_SECRET" JWT_KID="$JWT_KID" TENANT_ID="$TENANT_ID" USER_ID="$USER_ID" node - <<'NODE'
const crypto = require('crypto');
const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = enc({ alg: 'HS256', typ: 'JWT', kid: process.env.JWT_KID });
const payload = enc({
  sub: process.env.USER_ID,
  tenant_id: process.env.TENANT_ID,
  roles: ['tenant_admin'],
  scopes: ['agents:read', 'agents:write'],
  iss: 'octo-f2-smoke',
  aud: 'octo-api',
  iat: now,
  exp: now + 3600,
  jti: crypto.randomUUID(),
});
const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
process.stdout.write(`${header}.${payload}.${sig}`);
NODE
}

TOKEN="$(token)"
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

post_json /v1/agents/nodes '{"name":"F2 Smoke Agency","level":"agency"}' > "$tmp/agency.json"
agency_id="$(json_field "$tmp/agency.json" '.id')"
post_json /v1/agents/nodes "{\"name\":\"F2 Smoke Department\",\"level\":\"department\",\"parentId\":\"$agency_id\"}" > "$tmp/department.json"
department_id="$(json_field "$tmp/department.json" '.id')"
post_json /v1/agents/nodes "{\"name\":\"F2 Smoke Workspace\",\"level\":\"workspace\",\"parentId\":\"$department_id\"}" > "$tmp/workspace.json"
workspace_id="$(json_field "$tmp/workspace.json" '.id')"
post_json /v1/agents "{\"name\":\"F2 Smoke Agent\",\"role\":\"operator\",\"goal\":\"verify F2 agent graph\",\"hierarchyLevel\":\"agent\",\"hierarchyParentId\":\"$workspace_id\",\"capabilities\":[\"graph.smoke\"]}" > "$tmp/agent.json"
agent_id="$(json_field "$tmp/agent.json" '.id')"
get_json /v1/agents/graph > "$tmp/graph.json"
node - <<'NODE' "$tmp/graph.json" "$workspace_id" "$agent_id"
const fs = require('fs');
const graph = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const workspaceId = process.argv[3];
const agentId = process.argv[4];
const flat = [];
const walk = (nodes) => nodes.forEach((node) => { flat.push(node); walk(node.children || []); });
walk(graph);
const agentNode = flat.find((node) => node.agent && node.agent.id === agentId);
if (!agentNode || agentNode.parentId !== workspaceId) throw new Error('F2 Agent Graph smoke did not persist agent relationship');
if (!JSON.stringify(agentNode.effectiveCapabilities || []).includes('graph.smoke')) throw new Error('F2 Agent Graph smoke did not expose capabilities');
console.log(`F2 Agent Graph smoke passed: ${agentId} under ${workspaceId}`);
NODE
