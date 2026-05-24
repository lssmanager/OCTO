const baseUrl = process.env['ALERTMANAGER_URL'];
if (!baseUrl) {
  console.log('ALERTMANAGER_URL not set; skipping silence check in local env.');
  process.exit(0);
}
const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v2/silences`);
if (!res.ok) throw new Error(`Failed to fetch silences: ${res.status}`);
const silences = (await res.json()) as Array<any>;
const violations: string[] = [];
for (const s of silences) {
  if (!s.comment || !String(s.comment).trim()) violations.push(`${s.id}: missing comment`);
  if (!s.endsAt) violations.push(`${s.id}: missing endsAt`);
  if (s.status?.state === 'active' && new Date(s.endsAt).getTime() > new Date('9999-01-01').getTime()) violations.push(`${s.id}: open-ended`);
  const critical = (s.matchers ?? []).some((m: any) => m.name === 'severity' && m.value === 'critical');
  const approved = (s.matchers ?? []).some((m: any) => m.name === 'approval' && m.value === 'true');
  if (critical && !approved) violations.push(`${s.id}: critical silence without approval=true`);
}
if (violations.length) {
  console.error('Silence policy violations:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('Silence policy check passed.');
