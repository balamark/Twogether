import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// The migrator keys applied migrations by their integer version (PRIMARY KEY on
// _sqlx_migrations.version). Two files sharing a version means once one is
// recorded the other is treated as already-applied and silently skipped — its
// SQL never runs. That's exactly how the feature_flags table went missing
// (a duplicate 063). This test fails loudly on any duplicate version.
test.describe('DB migrations', () => {
  test('migration version numbers are unique', () => {
    const dir = path.resolve(__dirname, '..', 'database', 'migrations');
    const byVersion = new Map<number, string>();
    const dupes: string[] = [];

    for (const file of fs.readdirSync(dir)) {
      const m = file.match(/^(\d+)_.+\.sql$/);
      if (!m) continue;
      const version = parseInt(m[1], 10);
      if (byVersion.has(version)) {
        dupes.push(`version ${version}: "${byVersion.get(version)}" and "${file}"`);
      } else {
        byVersion.set(version, file);
      }
    }

    expect(byVersion.size, 'found migration files').toBeGreaterThan(0);
    expect(dupes, `duplicate migration versions:\n${dupes.join('\n')}`).toEqual([]);
  });
});
