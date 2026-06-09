#!/bin/sh
set -eu

fail() {
  echo "compose-env-preflight: $1" >&2
  exit 64
}

require_non_empty() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"
  if [ -z "$var_value" ]; then
    fail "$var_name is required and must not be empty"
  fi
}

require_non_empty POSTGRES_PASSWORD
require_non_empty REDIS_PASSWORD
require_non_empty DATABASE_URL
require_non_empty REDIS_URL
require_non_empty RUNTIME_POSTGRES_PASSWORD
require_non_empty RUNTIME_DATABASE_URL
require_non_empty JWT_SECRET
require_non_empty LITELLM_MASTER_KEY
require_non_empty INTERNAL_SECRET

if [ "${OCTO_TEST_LLM_FAKE:-false}" != "true" ]; then
  require_non_empty OPENAI_API_KEY
fi

if [ "${POSTGRES_USER:-octo}" = "${RUNTIME_POSTGRES_USER:-octo_runtime}" ]; then
  fail "RUNTIME_POSTGRES_USER must differ from POSTGRES_USER"
fi

if [ "${POSTGRES_PASSWORD}" = "${RUNTIME_POSTGRES_PASSWORD}" ]; then
  fail "RUNTIME_POSTGRES_PASSWORD must differ from POSTGRES_PASSWORD"
fi

if [ "${#JWT_SECRET}" -lt 32 ]; then
  fail "JWT_SECRET must be at least 32 characters"
fi

if [ "${#INTERNAL_SECRET}" -lt 32 ]; then
  fail "INTERNAL_SECRET must be at least 32 characters"
fi

export POSTGRES_DB="${POSTGRES_DB:-octo}"
export POSTGRES_USER="${POSTGRES_USER:-octo}"
export RUNTIME_POSTGRES_USER="${RUNTIME_POSTGRES_USER:-octo_runtime}"

node <<'JS'
const requiredDbName = process.env.POSTGRES_DB;
const adminUser = process.env.POSTGRES_USER;
const runtimeUser = process.env.RUNTIME_POSTGRES_USER;
const adminPassword = process.env.POSTGRES_PASSWORD;
const runtimePassword = process.env.RUNTIME_POSTGRES_PASSWORD;
const redisPassword = process.env.REDIS_PASSWORD;
const fakeMode = process.env.OCTO_TEST_LLM_FAKE === 'true';

function fail(message) {
  console.error(`compose-env-preflight: ${message}`);
  process.exit(65);
}

function parseUrl(raw, label) {
  try {
    return new URL(raw);
  } catch {
    fail(`${label} is not a valid URL`);
  }
}

function assertDbUrl(raw, label, expectedUser, expectedPassword) {
  const url = parseUrl(raw, label);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    fail(`${label} must use postgres:// or postgresql://`);
  }
  if (url.hostname !== 'postgres') {
    fail(`${label} must use the internal compose hostname postgres`);
  }
  const dbName = url.pathname.replace(/^\//, '');
  if (dbName !== requiredDbName) {
    fail(`${label} must target database ${requiredDbName}`);
  }
  if (decodeURIComponent(url.username) !== expectedUser) {
    fail(`${label} username must be ${expectedUser}`);
  }
  if (decodeURIComponent(url.password) !== expectedPassword) {
    fail(`${label} password does not match the configured secret for ${expectedUser}`);
  }
}

assertDbUrl(process.env.DATABASE_URL, 'DATABASE_URL', adminUser, adminPassword);
assertDbUrl(process.env.RUNTIME_DATABASE_URL, 'RUNTIME_DATABASE_URL', runtimeUser, runtimePassword);

const redisUrl = parseUrl(process.env.REDIS_URL, 'REDIS_URL');
if (!['redis:', 'rediss:'].includes(redisUrl.protocol)) {
  fail('REDIS_URL must use redis:// or rediss://');
}
if (redisUrl.hostname !== 'redis') {
  fail('REDIS_URL must use the internal compose hostname redis');
}
if (decodeURIComponent(redisUrl.password) !== redisPassword) {
  fail('REDIS_URL password must match REDIS_PASSWORD');
}

const litellmUrl = parseUrl(process.env.LITELLM_BASE_URL || 'http://litellm:4000', 'LITELLM_BASE_URL');
if (!['http:', 'https:'].includes(litellmUrl.protocol)) {
  fail('LITELLM_BASE_URL must use http:// or https://');
}
if (litellmUrl.hostname !== 'litellm') {
  fail('LITELLM_BASE_URL must use the internal compose hostname litellm');
}

if (!fakeMode && !process.env.OPENAI_API_KEY) {
  fail('OPENAI_API_KEY is required when OCTO_TEST_LLM_FAKE is not true');
}

console.log('compose-env-preflight: PASS');
JS
