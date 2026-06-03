import { Controller, Get, Header } from '@nestjs/common';
import { Public } from './admin/internal-secret.guard';

type PublicStatusView = {
  service: string;
  phase: string;
  version: string;
  commit: string;
  builtAt: string;
  environment: string;
  status: string;
};

const healthLinks = [
  { label: 'Liveness', href: '/api/health/live' },
  { label: 'Readiness', href: '/api/health/ready' },
  { label: 'Version metadata', href: '/api/health/version' },
] as const;

function buildPublicStatus(): PublicStatusView {
  return {
    service: 'octo-api',
    phase: process.env['BUILD_PHASE'] ?? 'F1',
    version: process.env['BUILD_VERSION'] ?? '0.1.0-f1',
    commit: process.env['BUILD_COMMIT'] ?? 'local',
    builtAt: process.env['BUILD_TIME'] ?? 'local',
    environment: process.env['NODE_ENV'] ?? 'development',
    status: 'reachable',
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

@Public()
@Controller()
export class PublicStatusController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  root(): string {
    const status = buildPublicStatus();
    const commitShort = status.commit.length > 12 ? status.commit.slice(0, 12) : status.commit;
    const rows: Array<[string, string]> = [
      ['Service', status.service],
      ['Phase', status.phase],
      ['Version', status.version],
      ['Commit', commitShort],
      ['Built at', status.builtAt],
      ['Environment', status.environment],
      ['Status', status.status],
    ];
    const metadataRows = rows
      .map(
        ([label, value]) =>
          `<dt>${escapeHtml(label)}</dt><dd><code>${escapeHtml(value)}</code></dd>`
      )
      .join('');
    const links = healthLinks
      .map(({ label, href }) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`)
      .join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OCTO ${escapeHtml(status.phase)} status</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e2e8f0; }
    main { width: min(760px, calc(100vw - 32px)); padding: 32px; border: 1px solid #334155; border-radius: 18px; background: #111827; box-shadow: 0 24px 60px rgb(0 0 0 / 0.32); }
    h1 { margin: 0 0 8px; font-size: clamp(2rem, 8vw, 4rem); letter-spacing: 0.02em; }
    p { margin: 0 0 24px; color: #cbd5e1; line-height: 1.6; }
    dl { display: grid; grid-template-columns: minmax(120px, 0.35fr) 1fr; gap: 12px 18px; margin: 24px 0; }
    dt { color: #94a3b8; font-weight: 700; }
    dd { margin: 0; overflow-wrap: anywhere; }
    code { color: #bae6fd; }
    a { color: #67e8f9; }
    ul { margin: 8px 0 0; padding-left: 20px; line-height: 1.8; }
    .badge { display: inline-flex; border: 1px solid #22c55e; color: #bbf7d0; border-radius: 999px; padding: 4px 10px; font-weight: 700; font-size: 0.85rem; }
  </style>
</head>
<body>
  <main>
    <span class="badge">${escapeHtml(status.status)}</span>
    <h1>OCTO</h1>
    <p>Operational F1 surface for the OCTO control plane. This page is intentionally lightweight and does not run dependency checks; use readiness for strict DB/Redis validation.</p>
    <dl>${metadataRows}</dl>
    <p>Health and metadata endpoints:</p>
    <ul>${links}</ul>
  </main>
</body>
</html>`;
  }
}
