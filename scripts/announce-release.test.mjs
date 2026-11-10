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
test('a store channel is sent as channel; the APK notice keeps its old body', async () => {
  for (const [channel, expected] of [['play', 'play'], ['ios', 'ios'], ['apk', undefined], ['', undefined]]) {
    const result = await announceRelease({ ...env, RELEASE_CHANNEL: channel }, async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.channel, expected);
      if (!expected) assert.deepEqual(body, { app: 'client', version: '1.0.123' });
      return { ok: true, status: 201 };
    }, { availabilityConfirmed: true });
    assert.equal(result.level, 'notice');
  }
});
test('a store channel failure names the store, not the APK', async () => {
  const result = await announceRelease({ ...env, RELEASE_CHANNEL: 'play' }, async () => ({ ok: false, status: 500 }), { availabilityConfirmed: true });
  assert.equal(result.level, 'warning');
  assert.match(result.message, /Google Play/);
  assert.ok(!/APK/.test(result.message));
});
test('an unknown channel is refused without a request', async () => {
  const result = await announceRelease({ ...env, RELEASE_CHANNEL: 'huawei' }, () => { throw new Error('must not call'); });
  assert.equal(result.level, 'warning');
  assert.match(result.message, /RELEASE_CHANNEL/);
});

test('direct store announcement calls cannot bypass the availability gate', async () => {
  for (const channel of ['play', 'ios']) {
    const result = await announceRelease({ ...env, RELEASE_CHANNEL: channel }, () => { throw new Error('must not call'); });
    assert.equal(result.level, 'notice');
    assert.equal(result.accepted, undefined);
    assert.match(result.message, /availability has not been confirmed/);
  }
});
