import { Controller, Get, Header } from '@nestjs/common';
import { Public } from './admin/internal-secret.guard';
import {
  PublicF1ClosureStatusService,
  type F1ClosureArea,
  type F1ClosureStatus,
} from './public-f1-closure-status.service';

const statusLabels: Record<F1ClosureArea['status'], string> = {
  ok: 'OK',
  partial: 'PARCIAL',
  error: 'ERROR',
  not_verified: 'NO VERIFICADO',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderList(values: string[], empty: string): string {
  if (values.length === 0) return `<span class="muted">${escapeHtml(empty)}</span>`;
  return `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function renderAreaRows(areas: F1ClosureArea[]): string {
  return areas
    .map(
      (area) => `<tr>
        <th scope="row">${escapeHtml(area.name)}</th>
        <td><span class="badge ${area.status}">${statusLabels[area.status]}</span></td>
        <td><strong>${area.percent}%</strong></td>
        <td>${renderList(area.evidence, 'No hay evidencia OK registrada.')}</td>
        <td>${renderList(area.missing, 'Sin bloqueos.')}</td>
        <td>${area.lastCheckedAt ? `<time>${escapeHtml(area.lastCheckedAt)}</time>` : '<span class="muted">No disponible</span>'}</td>
        <td><a href="${escapeHtml(area.link)}">${escapeHtml(area.link)}</a></td>
      </tr>`
    )
    .join('');
}

function renderMetadata(status: F1ClosureStatus): string {
  const rows: Array<[string, string]> = [
    ['Service', status.metadata.service],
    ['Phase', status.metadata.phase],
    ['Version', status.metadata.version],
    [
      'Commit',
      status.metadata.commit.length > 12
        ? status.metadata.commit.slice(0, 12)
        : status.metadata.commit,
    ],
    ['Built at', status.metadata.builtAt],
    ['Environment', status.metadata.environment],
    ['Overall status', status.overall.label],
  ];

  return rows
    .map(
      ([label, value]) => `<dt>${escapeHtml(label)}</dt><dd><code>${escapeHtml(value)}</code></dd>`
    )
    .join('');
}

export function renderF1ClosureDashboard(status: F1ClosureStatus): string {
  const blockingAreas =
    status.overall.blockingAreas.length > 0 ? status.overall.blockingAreas.join(', ') : 'none';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OCTO ${escapeHtml(status.metadata.phase)} Operational Closure Dashboard</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #f8fafc; color: #0f172a; }
    main { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0 40px; }
    header, section { border: 1px solid #dbe3ef; border-radius: 16px; background: #ffffff; box-shadow: 0 12px 28px rgb(15 23 42 / 0.06); }
    header { padding: 24px; margin-bottom: 16px; }
    section { padding: 18px; margin-top: 16px; overflow-x: auto; }
    .eyebrow { margin: 0 0 4px; color: #475569; font-size: 0.85rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(2rem, 5vw, 3.25rem); letter-spacing: 0.01em; }
    h2 { margin: 0 0 12px; font-size: 1.1rem; }
    p { line-height: 1.55; }
    dl { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px 18px; margin: 20px 0 0; }
    dt { color: #64748b; font-weight: 750; font-size: 0.8rem; text-transform: uppercase; }
    dd { margin: 2px 0 0; overflow-wrap: anywhere; }
    code { color: #0369a1; font-weight: 700; }
    a { color: #0369a1; font-weight: 650; text-decoration-thickness: 0.08em; }
    table { width: 100%; border-collapse: collapse; min-width: 980px; }
    th, td { padding: 12px 10px; border-top: 1px solid #e2e8f0; vertical-align: top; text-align: left; }
    thead th { border-top: 0; color: #475569; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
    tbody th { width: 170px; }
    ul { margin: 0; padding-left: 18px; }
    li + li { margin-top: 3px; }
    .summary { display: grid; grid-template-columns: minmax(220px, 0.55fr) 1fr; gap: 16px; align-items: stretch; }
    .status-panel { padding: 18px; border-radius: 14px; border: 1px solid #e2e8f0; background: #f8fafc; }
    .percent { margin: 8px 0 0; font-size: 2rem; font-weight: 850; }
    .message { margin: 8px 0 0; color: #334155; }
    .blocking { margin: 8px 0 0; color: #475569; }
    .badge { display: inline-flex; align-items: center; white-space: nowrap; border-radius: 999px; padding: 4px 10px; font-weight: 850; font-size: 0.78rem; border: 1px solid; }
    .ok { background: #dcfce7; border-color: #86efac; color: #166534; }
    .partial { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
    .error { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
    .not_verified { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
    .muted { color: #64748b; }
    @media (max-width: 760px) { dl, .summary { grid-template-columns: 1fr; } main { width: min(100% - 20px, 1180px); padding-top: 10px; } header, section { border-radius: 12px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">OCTO</p>
      <h1>F1 Operational Closure Dashboard</h1>
      <dl>${renderMetadata(status)}</dl>
    </header>

    <section class="summary" aria-label="F1 overall status">
      <div class="status-panel">
        <span class="badge ${status.overall.status === 'operating_100' ? 'ok' : status.overall.status === 'blocked' ? 'error' : status.overall.status === 'not_verified' ? 'not_verified' : 'partial'}">${escapeHtml(status.overall.label)}</span>
        <div class="percent">${status.overall.percent}%</div>
        <p class="message">${escapeHtml(status.overall.message)}</p>
      </div>
      <div class="status-panel">
        <h2>Operational truth source</h2>
        <p>This page derives status from live readiness checks, worker heartbeat evidence, migration metadata, and explicit smoke/gate evidence flags. It never claims 100% unless every area is OK.</p>
        <p class="blocking"><strong>Blocking areas:</strong> ${escapeHtml(blockingAreas)}</p>
        <p class="muted">JSON endpoint: <a href="/api/f1/closure-status">/api/f1/closure-status</a>. Generated at <time>${escapeHtml(status.generatedAt)}</time>.</p>
      </div>
    </section>

    <section aria-label="F1 area status">
      <h2>Areas</h2>
      <table>
        <thead>
          <tr>
            <th>Area</th>
            <th>Status</th>
            <th>Percent</th>
            <th>Evidence used</th>
            <th>Missing / blocking evidence</th>
            <th>Last verified</th>
            <th>Endpoint / smoke</th>
          </tr>
        </thead>
        <tbody>${renderAreaRows(status.areas)}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

@Public()
@Controller()
export class PublicStatusController {
  constructor(private readonly closureStatusService: PublicF1ClosureStatusService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async root(): Promise<string> {
    const status = await this.closureStatusService.getStatus();
    return renderF1ClosureDashboard(status);
  }

  @Get('f1/closure-status')
  async closureStatus(): Promise<F1ClosureStatus> {
    return this.closureStatusService.getStatus();
  }
}
