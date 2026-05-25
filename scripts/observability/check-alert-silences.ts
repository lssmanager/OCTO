const base = process.env.GRAFANA_URL ?? process.env.ALERTMANAGER_URL;
if (!base) {
  console.error('Set GRAFANA_URL or ALERTMANAGER_URL');
  process.exit(1);
}
console.log('Silence policy checker placeholder: verify comment, endsAt, finite duration, critical approval labels.');
