import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readMigrateSource(): string {
  return readFileSync(join(__dirname, 'migrate.ts'), 'utf8');
}

describe('standalone migration runner contract', () => {
  it('casts schema parameters used inside PostgreSQL format calls', () => {
    const source = readMigrateSource();

    expect(source).toContain("format('%I.%I', $1::text, required.table_name)");
    expect(source).not.toContain("format('%I.%I', $1, required.table_name)");
  });
});
