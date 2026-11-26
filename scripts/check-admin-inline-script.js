#!/usr/bin/env node

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const vm = require('vm');
const { ADMIN_HTML } = require('../routes/admin');

const blocks = [...ADMIN_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (blocks.length === 0) {
  console.error('✗ No inline <script> found in admin HTML');
  process.exit(1);
}

let failed = false;
blocks.forEach((code, i) => {
  try {
    new vm.Script(code, { filename: `admin-inline-script-${i}.js` });
  } catch (e) {
    failed = true;
    console.error(`✗ admin inline <script> #${i} has a syntax error: ${e.message}`);
  }
});

if (failed) process.exit(1);
console.log(`✓ admin inline script OK (${blocks.length} block(s) parsed)`);
process.exit(0);
