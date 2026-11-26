'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./server');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tapri-'));
fs.copyFileSync(path.join(__dirname, 'data', 'menu.json'), path.join(dataDir, 'menu.json'));
const server = createServer({ dataDir, adminToken: 'secret' });
let base;

test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
test.after(() => server.close());

const post = (body) => fetch(base + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('health endpoint responds ok', async () => {
  const r = await fetch(base + '/api/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'ok');
});

test('menu has three categories with priced items', async () => {
  const m = await (await fetch(base + '/api/menu')).json();
  assert.equal(m.categories.length, 3);
  for (const c of m.categories) for (const i of c.items) assert.ok(i.price > 0 && i.name);
});

test('contact rejects invalid input', async () => {
  const r = await post({ name: 'A', email: 'bad', message: 'short' });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.ok(body.errors.name && body.errors.email && body.errors.message);
});

test('contact stores a valid message and admin can read it', async () => {
  const r = await post({ name: 'Asha', email: 'asha@example.com', topic: 'Event booking', message: 'Can you cater 30 people on Friday?' });
  assert.equal(r.status, 201);
  const noAuth = await fetch(base + '/api/messages');
  assert.equal(noAuth.status, 401);
  const list = await (await fetch(base + '/api/messages', { headers: { Authorization: 'Bearer secret' } })).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Asha');
});

test('static pages are served and unknown paths return 404 page', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/menu.html')).status, 200);
  assert.equal((await fetch(base + '/nope.html')).status, 404);
});

test('path traversal cannot read files outside frontend', async () => {
  const r = await fetch(base + '/..%2fbackend%2fserver.js');
  assert.equal(r.status, 404);
  assert.ok(!(await r.text()).includes('createServer'));
});
