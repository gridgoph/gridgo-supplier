import { Buffer } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { MAX_AGE_MS, appStoreToken, storeAvailable, validPendingRelease, playReleasePublished } from './store-availability.mjs';
import { pendingRelease } from './queue-store-release.mjs';
import { ENV, NOW, PLAY_RELEASE, IOS_RELEASE, PUBLIC_KEYS, fixture, response } from './test-support/store-release.mjs';

const available = (release, mock, env = ENV) => storeAvailable(release, env, mock.transport, NOW);

test('queue writes only build identity, never credentials, and requires a store channel', () => {
  const result = pendingRelease({ ...ENV, RELEASE_CHANNEL: 'ios', RELEASE_VERSION: '1.0.43',
    RELEASE_BUILD_NUMBER: '43', RELEASE_STORE_VERSION: '1.0.0' }, NOW);
  assert.deepEqual(result, { ...IOS_RELEASE, queuedAt: new Date(NOW).toISOString() });
  assert.equal(JSON.stringify(result).includes('fake-'), false);
  assert.throws(() => pendingRelease({ ...ENV, RELEASE_CHANNEL: 'apk' }, NOW));
});

test('Play queue records the actual closed track and refuses internal-only or unknown uploads', () => {
  const env = { ...ENV, RELEASE_CHANNEL: 'play', RELEASE_VERSION: '1.0.42', RELEASE_BUILD_NUMBER: '42', PLAY_TRACK: 'alpha' };
  assert.deepEqual(pendingRelease(env, NOW), { ...PLAY_RELEASE, queuedAt: new Date(NOW).toISOString() });
  for (const track of ['internal', undefined, 'beta', 'closed']) {
    assert.throws(() => pendingRelease({ ...env, PLAY_TRACK: track }, NOW));
  }
});

test('reject stale, future, malformed, wrong-app, wrong-build and wrong-store metadata before networking', async () => {
  for (const patch of [{ queuedAt: new Date(NOW - MAX_AGE_MS).toISOString() }, { queuedAt: new Date(NOW + 1).toISOString() },
    { queuedAt: null }, { version: 42 }, { version: '01.0.42' }, { buildNumber: '41' }, { app: 'rider' },
    { channel: 'apk' }, { playTrack: 'internal' }, { playTrack: undefined }, { packageName: 'ph.gridgo.rider' }]) {
    const mock = fixture();
    assert.equal(await available({ ...PLAY_RELEASE, ...patch }, mock), false);
    assert.equal(mock.state.calls.length, 0);
  }
  assert.equal(validPendingRelease({ ...IOS_RELEASE, ascAppId: 'other' }, ENV, NOW), false);
});

test('Play requires lifecycle PUBLISHED with exact active versionCode on the queued closed track', async () => {
  const closedOnly = fixture();
  delete closedOnly.state.lifecycle.internal;
  delete closedOnly.state.rollout.internal;
  assert.equal(await available(PLAY_RELEASE, closedOnly), true);
  assert.equal(closedOnly.state.calls.some(call => call.url.includes('/tracks/internal')), false);
  for (const status of ['RELEASE_LIFECYCLE_STATE_IN_REVIEW', 'RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED',
    'RELEASE_LIFECYCLE_STATE_NOT_APPROVED', 'RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW',
    'RELEASE_LIFECYCLE_STATE_DRAFT', 'UNKNOWN', undefined]) {
    const mock = fixture();
    mock.state.lifecycle.alpha.releases[0].releaseLifecycleState = status;
    assert.equal(await available(PLAY_RELEASE, mock), false);
  }
  const mock = fixture();
  mock.state.lifecycle.alpha.releases[0].activeArtifacts = [{ versionCode: 41 }];
  assert.equal(await available(PLAY_RELEASE, mock), false);
  assert.equal(playReleasePublished({ releases: [{ status: 'completed', versionCodes: ['42'] }] }, 'alpha', '42'), false);
  const internalOnly = fixture(); internalOnly.state.lifecycle.alpha.releases = [];
  assert.equal(await available(PLAY_RELEASE, internalOnly), false);
});

test('Play rejects staged/halted/missing rollouts and always discards read edit without committing', async () => {
  for (const patch of [{ status: 'inProgress', userFraction: 0.5 }, { status: 'halted' }, { status: 'draft' },
    { status: undefined }, { versionCodes: ['41'] }, { userFraction: 0.5 }]) {
    const mock = fixture(); Object.assign(mock.state.rollout.alpha.releases[0], patch);
    assert.equal(await available(PLAY_RELEASE, mock), false);
    assert.equal(mock.state.calls.at(-1).options.method, 'DELETE');
    assert.equal(mock.state.calls.some(call => call.url.includes(':commit')), false);
  }
});

test('Play lifecycle endpoint errors fail closed without falling back to completed or an install header', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const mock = fixture();
    mock.state.overrides.set('/androidpublisher/v3/applications/ph.gridgo.client/tracks/alpha/releases', async () => response({}, status));
    assert.equal(await available(PLAY_RELEASE, mock), false);
    assert.equal(mock.state.calls.some(call => call.url.endsWith('/edits')), false);
  }
});

test('iOS requires VALID, non-expired exact build, explicit approval and actively testing state', async () => {
  assert.equal(await available(IOS_RELEASE, fixture()), true);
  for (const patch of [{ processingState: 'PROCESSING' }, { processingState: 'FAILED' }, { processingState: 'INVALID' },
    { processingState: undefined }, { expired: true }, { expired: undefined }, { expirationDate: new Date(NOW).toISOString() }, { version: '42' }]) {
    const mock = fixture(); Object.assign(mock.state.builds.data[0].attributes, patch);
    assert.equal(await available(IOS_RELEASE, mock), false);
  }
  for (const status of ['IN_REVIEW', 'WAITING_FOR_REVIEW', 'REJECTED', 'UNKNOWN', undefined]) {
    const mock = fixture(); mock.state.review.data.attributes.betaReviewState = status;
    assert.equal(await available(IOS_RELEASE, mock), false);
  }
  for (const status of ['BETA_APPROVED', 'READY_FOR_BETA_TESTING', 'WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW', 'UNKNOWN', undefined]) {
    const mock = fixture(); mock.state.detail.data.attributes.externalBuildState = status;
    assert.equal(await available(IOS_RELEASE, mock), false);
  }
});

test('iOS requires at least one assigned external group and testing readiness for every assigned group', async () => {
  for (const change of [s => { s.groups.data = []; }, s => { s.groups.data = [s.groups.data[1]]; },
    s => { s.members.external.data = []; },
    s => { s.detail.data.attributes.internalBuildState = 'READY_FOR_BETA_TESTING'; },
    s => { delete s.groups.data[0].attributes.isInternalGroup; }]) {
    const mock = fixture(); change(mock.state);
    assert.equal(await available(IOS_RELEASE, mock), false);
  }
});

test('iOS intentionally unassigned external and internal groups do not block a live external build', async () => {
  const mock = fixture();
  mock.state.groups.data.push({ id: 'withheld', attributes: { isInternalGroup: false } });
  mock.state.members.withheld = { data: [] };
  mock.state.members.internal = { data: [] };
  mock.state.detail.data.attributes.internalBuildState = 'READY_FOR_BETA_TESTING';
  assert.equal(await available(IOS_RELEASE, mock), true);
});

test('Apple pagination finds assignments on later pages and checks every assigned group', async () => {
  const mock = fixture();
  mock.state.groups.links = { next: 'https://api.appstoreconnect.apple.com/v1/betaGroups?cursor=next' };
  const extraGroup = { id: 'internal-2', attributes: { isInternalGroup: true } };
  mock.state.overrides.set(mock.state.groups.links.next, async () => response({ data: [extraGroup] }));
  mock.state.members['internal-2'] = { data: [] };
  mock.state.members.internal = { data: [] };
  mock.state.detail.data.attributes.internalBuildState = 'READY_FOR_BETA_TESTING';
  assert.equal(await available(IOS_RELEASE, mock), true); // intentionally unassigned group
  mock.state.members['internal-2'].links = { next: 'https://api.appstoreconnect.apple.com/v1/more-builds' };
  mock.state.overrides.set('https://api.appstoreconnect.apple.com/v1/more-builds', async () => response({ data: [{ type: 'builds', id: 'build-43' }] }));
  assert.equal(await available(IOS_RELEASE, mock), false); // assigned internal group is not ready
  mock.state.detail.data.attributes.internalBuildState = 'IN_BETA_TESTING';
  assert.equal(await available(IOS_RELEASE, mock), true);
});

test('unreadable group membership never guesses that a group is unassigned', async () => {
  const mock = fixture();
  mock.state.overrides.set('/v1/betaGroups/internal/relationships/builds', async () => response({}, 503));
  assert.equal(await available(IOS_RELEASE, mock), false);
});

test('unknown/missing/multiple builds, transport failures and unsafe Apple pagination never confirm availability', async () => {
  for (const change of [s => { s.builds.data = []; }, s => { s.builds.data.push(s.builds.data[0]); },
    s => { s.groups.links = { next: 'https://untrusted.example.invalid/steal' }; },
    s => { s.overrides.set('/v1/builds', async () => { throw new Error('secret error'); }); }]) {
    const mock = fixture(); change(mock.state);
    assert.equal(await available(IOS_RELEASE, mock), false);
    assert.equal(mock.state.calls.some(call => call.url.includes('untrusted')), false);
  }
  assert.equal(await available(IOS_RELEASE, fixture(), { ...ENV, ASC_API_KEY_P8: '' }), false);
});

test('ASC uses short-lived ES256 JWT with P1363 signature; exact app, version and build are queried', async () => {
  const token = appStoreToken(ENV, NOW);
  const [header, payload, signature] = token.split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'ES256');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.exp - claims.iat, 600);
  assert.equal(claims.aud, 'appstoreconnect-v1');
  assert.equal(verify('sha256', Buffer.from(`${header}.${payload}`), { key: PUBLIC_KEYS.ec, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
  const mock = fixture(); await available(IOS_RELEASE, mock);
  const params = new URL(mock.state.calls[0].url).searchParams;
  assert.equal(params.get('filter[app]'), '12345');
  assert.equal(params.get('filter[version]'), '43');
  assert.equal(params.get('filter[preReleaseVersion.version]'), '1.0.0');
});
