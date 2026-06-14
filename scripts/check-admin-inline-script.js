#!/usr/bin/env node
// Guards against syntax errors in the /admin dashboard's inline <script>.
//
// That script lives inside a JS *template literal* in routes/admin.js, so eslint
// and `node --check routes/admin.js` see it as a string, not code — a stray
// escape (e.g. `\n` inside a JS string, which the template literal turns into a
// real newline) produces a broken SERVED script that only fails in the browser
// ("Invalid or unexpected token"), killing the whole dashboard.
//
// Here we take the rendered HTML, extract each <script>, and PARSE it with
// vm.Script (compile-only — it never executes, so browser globals like
// `document`/`window` are irrelevant). Any SyntaxError fails the build. This is
// the fast, browser-free counterpart to the Playwright admin `pageerror` guard.

process.env.NODE_ENV = process.env.NODE_ENV || 'test'; // skip admin.js retention timer
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
    // Parse only — does not run the script.
    new vm.Script(code, { filename: `admin-inline-script-${i}.js` });
  } catch (e) {
    failed = true;
    console.error(`✗ admin inline <script> #${i} has a syntax error: ${e.message}`);
  }
});

if (failed) process.exit(1);
console.log(`✓ admin inline script OK (${blocks.length} block(s) parsed)`);
process.exit(0);
