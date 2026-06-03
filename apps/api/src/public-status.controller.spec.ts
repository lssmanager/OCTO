import { describe, expect, it, afterEach } from 'vitest';
import { PublicStatusController } from './public-status.controller';

const buildEnvKeys = [
  'BUILD_PHASE',
  'BUILD_VERSION',
  'BUILD_COMMIT',
  'BUILD_TIME',
  'NODE_ENV',
] as const;
const originalEnv = Object.fromEntries(buildEnvKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of buildEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('PublicStatusController', () => {
  it('renders an operational OCTO root surface with F1 metadata and health links', () => {
    process.env['BUILD_PHASE'] = 'F1';
    process.env['BUILD_VERSION'] = '0.1.0-f1-test';
    process.env['BUILD_COMMIT'] = 'abcdef1234567890';
    process.env['BUILD_TIME'] = '2026-06-03T00:00:00Z';
    process.env['NODE_ENV'] = 'production';

    const html = new PublicStatusController().root();

    expect(html).toContain('<h1>OCTO</h1>');
    expect(html).toContain('F1');
    expect(html).toContain('0.1.0-f1-test');
    expect(html).toContain('abcdef123456');
    expect(html).toContain('2026-06-03T00:00:00Z');
    expect(html).toContain('/api/health/live');
    expect(html).toContain('/api/health/ready');
    expect(html).toContain('/api/health/version');
    expect(html).not.toContain('Cannot GET /');
  });

  it('escapes build metadata before embedding it in HTML', () => {
    process.env['BUILD_VERSION'] = '<script>alert(1)</script>';
    process.env['BUILD_COMMIT'] = '"quoted"';

    const html = new PublicStatusController().root();

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
