import test from 'node:test';
import assert from 'node:assert/strict';
import { announceRelease } from './announce-release.mjs';

const env = { RELEASE_APP: 'client', RELEASE_VERSION: '1.0.123', RELEASE_ANNOUNCE_TOKEN: 'test-secret' };
test('missing secret skips without a request', async () => {
  const result = await announceRelease({ ...env, RELEASE_ANNOUNCE_TOKEN: '' }, () => { throw new Error('must not call'); });
  assert.equal(result.level, 'notice');
  assert.match(result.message, /skipped.*RELEASE_ANNOUNCE_TOKEN/);
});
test('sends the app and released version using a server-only bearer', async () => {
  const result = await announceRelease(env, async (url, options) => {
    assert.equal(url, 'https://gridgo-api.talasora.com/release-announcements');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    assert.deepEqual(JSON.parse(options.body), { app: 'client', version: '1.0.123' });
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    return { ok: true, status: 201 };
  });
  assert.equal(result.level, 'notice');
  assert.match(result.message, /accepted/);
});
test('HTTP failures and network errors become warnings without leaking errors or tokens', async () => {
  for (const transport of [async () => ({ ok: false, status: 401 }), async () => { throw new Error(env.RELEASE_ANNOUNCE_TOKEN); }]) {
    const result = await announceRelease(env, transport);
    assert.equal(result.level, 'warning');
    assert.match(result.message, /already published/);
    assert.ok(!result.message.includes(env.RELEASE_ANNOUNCE_TOKEN));
  }
});
test('an idempotent retry is success', async () => {
  assert.equal((await announceRelease(env, async () => ({ ok: true, status: 200 }))).level, 'notice');
});
test('the APK release keeps its body; Play and TestFlight name their channel', async () => {
  const bodies = [];
  const transport = async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true, status: 201 }; };
  await announceRelease(env, transport);
  await announceRelease({ ...env, RELEASE_CHANNEL: 'apk' }, transport);
  await announceRelease({ ...env, RELEASE_CHANNEL: 'play' }, transport);
  await announceRelease({ ...env, RELEASE_CHANNEL: 'ios' }, transport);
  assert.deepEqual(bodies, [
    { app: 'client', version: '1.0.123' },
    { app: 'client', version: '1.0.123', channel: 'apk' },
    { app: 'client', version: '1.0.123', channel: 'play' },
    { app: 'client', version: '1.0.123', channel: 'ios' },
  ]);
});
test('a store failure names that store, not the APK', async () => {
  const result = await announceRelease({ ...env, RELEASE_CHANNEL: 'ios' }, async () => ({ ok: false, status: 502 }));
  assert.equal(result.level, 'warning');
  assert.match(result.message, /TestFlight upload is already published/);
});
test('an unknown channel is refused without a request', async () => {
  const result = await announceRelease({ ...env, RELEASE_CHANNEL: 'web' }, () => { throw new Error('must not call'); });
  assert.equal(result.level, 'warning');
  assert.match(result.message, /RELEASE_CHANNEL/);
});
