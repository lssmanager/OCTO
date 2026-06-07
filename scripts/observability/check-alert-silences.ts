/* eslint-disable no-console */

type Matcher = { name?: string; value?: string; isRegex?: boolean };
type Silence = {
  id?: string;
  comment?: string;
  startsAt?: string;
  endsAt?: string;
  matchers?: Matcher[];
  status?: { state?: string };
  labels?: Record<string, string>;
};

const baseUrl = process.env.ALERTMANAGER_URL ?? process.env.GRAFANA_URL;
const apiToken = process.env.GRAFANA_TOKEN ?? process.env.ALERTMANAGER_TOKEN;
const criticalApprovalLabel = process.env.CRITICAL_SILENCE_APPROVAL_LABEL ?? 'approved_by';

if (!baseUrl) {
  console.error('Missing ALERTMANAGER_URL or GRAFANA_URL');
  process.exit(1);
}

function matcherTargetsCritical(m: Matcher): boolean {
  if (m.name !== 'severity' || !m.value) return false;
  if (!m.isRegex) return m.value === 'critical';

  try {
    return new RegExp(m.value).test('critical');
  } catch {
    return false;
  }
}

function hasCriticalMatcher(s: Silence): boolean {
  return (s.matchers ?? []).some(matcherTargetsCritical);
}

function hasApprovalLabel(s: Silence): boolean {
  if (s.labels && s.labels[criticalApprovalLabel]) return true;
  return (s.matchers ?? []).some((m) => m.name === criticalApprovalLabel && Boolean(m.value));
}

async function fetchSilences(): Promise<Silence[]> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiToken) headers.Authorization = `Bearer ${apiToken}`;

  const amUrl = `${baseUrl.replace(/\/$/, '')}/api/v2/silences`;
  const resp = await fetch(amUrl, { headers });
  if (!resp.ok) {
    throw new Error(`silence api failed: ${resp.status} ${resp.statusText}`);
  }
  return (await resp.json()) as Silence[];
}

function validate(silences: Silence[]): string[] {
  const violations: string[] = [];
  const now = Date.now();
  for (const s of silences) {
    const state = s.status?.state ?? 'active';
    if (!['active', 'pending'].includes(state)) continue;

    const id = s.id ?? 'unknown-id';
    const comment = (s.comment ?? '').trim();
    const endsAt = s.endsAt ? Date.parse(s.endsAt) : NaN;
    const startsAt = s.startsAt ? Date.parse(s.startsAt) : NaN;

    if (!comment) violations.push(`${id}: silence missing reason/comment`);
    if (!s.endsAt || Number.isNaN(endsAt)) violations.push(`${id}: silence missing valid endsAt`);
    if (!Number.isNaN(endsAt) && endsAt <= now) violations.push(`${id}: silence already expired`);
    if (!Number.isNaN(startsAt) && !Number.isNaN(endsAt) && endsAt - startsAt > 1000 * 60 * 60 * 24 * 30) {
      violations.push(`${id}: open-ended/too-long silence (>30d)`);
    }
    if (hasCriticalMatcher(s) && !hasApprovalLabel(s)) {
      violations.push(`${id}: critical silence requires ${criticalApprovalLabel}`);
    }
  }
  return violations;
}

async function main(): Promise<void> {
  const silences = await fetchSilences();
  const violations = validate(silences);
  if (violations.length > 0) {
    console.error('Silence policy violations detected:');
    for (const v of violations) console.error(`- ${v}`);
    process.exit(1);
  }
  console.log(`Silence policy validation passed. Checked ${silences.length} silences.`);
}

main().catch((error) => {
  console.error('Silence policy checker failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
