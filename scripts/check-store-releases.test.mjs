import { Buffer } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pendingRelease } from './queue-store-release.mjs';
import { checkStoreReleases, pendingArtifacts, readReleaseArtifact } from './check-store-releases.mjs';
import { MAX_AGE_MS } from './store-availability.mjs';
import { ENV, NOW, fixture, response } from './test-support/store-release.mjs';

const check = (mock, options = {}) => checkStoreReleases(ENV, { ...mock, now: NOW, ...options });
const sends = mock => mock.state.calls.filter(call => call.url.includes('gridgo-api'));
const removed = mock => mock.state.calls.filter(call => call.url.includes('api.github.com') && call.options.method === 'DELETE');

test('scheduled dry run exercises both store gates without announcing or deleting pending records', async () => {
  const mock = fixture();
  assert.deepEqual(await check(mock), { pending: 2, available: 2, accepted: 0 });
  assert.equal(sends(mock).length, 0);
  assert.equal(removed(mock).length, 0);
  // GitHub bearer stops at GitHub; signed artifact downloads have no auth header.
  for (const call of mock.state.calls.filter(call => call.url.includes('artifacts.example.invalid'))) {
    assert.equal(call.options.headers, undefined);
  }
});

test('unavailable stores never reach announce endpoint even with send enabled', async () => {
  const mock = fixture();
  mock.state.lifecycle.alpha.releases[0].releaseLifecycleState = 'RELEASE_LIFECYCLE_STATE_IN_REVIEW';
  mock.state.detail.data.attributes.externalBuildState = 'WAITING_FOR_BETA_REVIEW';
  assert.deepEqual(await check(mock, { dryRun: false }), { pending: 2, available: 0, accepted: 0 });
  assert.equal(sends(mock).length, 0);
  assert.equal(removed(mock).length, 0);
});

test('gated send uses exact app/version/channel and removes pending only after API acceptance', async () => {
  const mock = fixture();
  assert.deepEqual(await check(mock, { dryRun: false }), { pending: 2, available: 2, accepted: 2 });
  assert.deepEqual(sends(mock).map(call => JSON.parse(call.options.body)), [
    { app: 'client', version: '1.0.42', channel: 'play' }, { app: 'client', version: '1.0.43', channel: 'ios' },
  ]);
  assert.equal(removed(mock).length, 2);
  for (const call of removed(mock)) {
    assert.ok(mock.state.calls.indexOf(call) > mock.state.calls.indexOf(sends(mock)[0]));
  }
});

test('internal or legacy trackless pending artifacts never send a Play notice', async () => {
  for (const playTrack of ['internal', undefined]) {
    const mock = fixture(); mock.state.releases.play.playTrack = playTrack;
    assert.deepEqual(await check(mock, { dryRun: false }), { pending: 1, available: 1, accepted: 1 });
    assert.deepEqual(sends(mock).map(call => JSON.parse(call.options.body).channel), ['ios']);
  }
});

test('closed-only publishing and intentionally unassigned TestFlight groups can announce when available', async () => {
  const mock = fixture();
  delete mock.state.lifecycle.internal; delete mock.state.rollout.internal;
  mock.state.groups.data.push({ id: 'withheld', attributes: { isInternalGroup: false } });
  mock.state.members.withheld = { data: [] };
  assert.deepEqual(await check(mock, { dryRun: false }), { pending: 2, available: 2, accepted: 2 });
});

test('API failure or missing announcement credential retains pending record for a later check', async () => {
  const mock = fixture(); mock.state.announceStatus = 503;
  assert.equal((await check(mock, { dryRun: false })).accepted, 0);
  assert.equal(removed(mock).length, 0);
  const missingToken = fixture();
  await checkStoreReleases({ ...ENV, RELEASE_ANNOUNCE_TOKEN: '' }, { ...missingToken, now: NOW, dryRun: false });
  assert.equal(sends(missingToken).length, 0);
  assert.equal(removed(missingToken).length, 0);
});

test('cleanup failure retries safely using existing API app/version/channel de-duplication', async () => {
  const mock = fixture();
  for (const id of [301, 302]) mock.state.overrides.set(`/repos/example/app/actions/artifacts/${id}`, async () => response({}, 500));
  await check(mock, { dryRun: false }); await check(mock, { dryRun: false });
  assert.equal(sends(mock).length, 4);
  assert.equal(mock.state.notices.size, 2); // simulated API idempotency keys
});

test('seven-day expiry is silent and future records, wrong channels and malformed artifacts are ignored', async () => {
  for (const patch of [{ queuedAt: new Date(NOW - MAX_AGE_MS).toISOString() }, { channel: 'apk' },
    { queuedAt: new Date(NOW + 1000).toISOString() }, { version: null }]) {
    const mock = fixture();
    Object.assign(mock.state.releases.play, patch); Object.assign(mock.state.releases.ios, patch);
    assert.deepEqual(await check(mock, { dryRun: false }), { pending: 0, available: 0, accepted: 0 });
    assert.equal(sends(mock).length, 0);
  }
  const corrupt = fixture(); corrupt.readArtifact = async () => { throw new Error('Corrupt ZIP'); };
  assert.equal((await check(corrupt, { dryRun: false })).pending, 0);
});

test('ignores PR/non-main/wrong-workflow/failed/old runs without downloading artifacts', async () => {
  for (const patch of [{ head_branch: 'feature' }, { event: 'pull_request' }, { path: '.github/workflows/untrusted.yml' },
    { conclusion: 'failure' }, { created_at: new Date(NOW - MAX_AGE_MS).toISOString() }]) {
    const mock = fixture();
    for (const workflow of ['android-release.yml', 'ios-testflight.yml']) {
      mock.state.overrides.set(`/repos/example/app/actions/workflows/${workflow}/runs`, async () => response({ workflow_runs: [{
        id: 201, head_branch: 'main', event: 'workflow_dispatch', conclusion: 'success',
        path: `.github/workflows/${workflow}`, created_at: new Date(NOW - 3600000).toISOString(), ...patch,
      }] }));
    }
    assert.equal((await check(mock, { dryRun: false })).pending, 0);
    assert.equal(mock.state.calls.some(call => call.url.endsWith('/zip')), false);
  }
});

test('expired or oversized artifacts are ignored', async () => {
  for (const patch of [{ expired: true }, { size_in_bytes: 65537 }]) {
    const mock = fixture();
    for (const id of [201, 202]) mock.state.overrides.set(`/repos/example/app/actions/runs/${id}/artifacts`, async () => response({
      artifacts: [{ id: 301, name: `pending-store-release-${id === 201 ? 'play' : 'ios'}`, expired: false, size_in_bytes: 100, ...patch }],
    }));
    assert.equal((await check(mock)).pending, 0);
  }
});

test('workflow run pagination discovers older pending uploads', async () => {
  const mock = fixture();
  const path = '/repos/example/app/actions/workflows/android-release.yml/runs';
  mock.state.overrides.set(path, async url => response({ workflow_runs: new URL(url).searchParams.get('page') === '1'
    ? Array.from({ length: 100 }, () => ({ head_branch: 'ignored' })) : [{ id: 201, head_branch: 'main',
      event: 'workflow_dispatch', conclusion: 'success', path: '.github/workflows/android-release.yml',
      created_at: new Date(NOW - 3600000).toISOString() }] }));
  assert.equal((await pendingArtifacts(ENV, mock.transport, NOW, mock.readArtifact)).length, 2);
});

test('archive reader reads bounded JSON only and cleans temporary files', async () => {
  const zip = execFileSync('python3', ['-c', 'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr("release.json",\'{"app":"client"}\'); z.close(); sys.stdout.buffer.write(b.getvalue())']);
  assert.deepEqual(await readReleaseArtifact(zip), { app: 'client' });
  await assert.rejects(readReleaseArtifact(Buffer.from('invalid zip')));
  await assert.rejects(readReleaseArtifact(Buffer.alloc(65537)));
});

test('workflow only runs trusted main code; default manual run is dry; schedule is bounded and serialized', () => {
  const workflow = readFileSync(new URL('../.github/workflows/store-release-notices.yml', import.meta.url), 'utf8');
  for (const text of ["cron: '17,47 * * * *'", 'cancel-in-progress: false', 'timeout-minutes: 10',
    "if: github.ref == 'refs/heads/main'", 'ref: main', 'default: true', "github.event_name == 'schedule' && '--send'", 'node scripts/check-store-releases.mjs']) {
    assert.ok(workflow.includes(text), text);
  }
  assert.equal(workflow.includes('pull_request'), false);
  assert.ok(workflow.includes('group: play-store-access'));
  assert.ok(workflow.includes('queue: max'));
  const android = readFileSync(new URL('../.github/workflows/android-release.yml', import.meta.url), 'utf8');
  assert.ok(android.includes("github.event.inputs.play_bundle == 'true' && 'play-store-access'"));
  assert.ok(android.includes("cancel-in-progress: ${{ github.event.inputs.play_bundle != 'true' }}"));
  assert.ok(android.includes("queue: ${{ github.event.inputs.play_bundle == 'true' && 'max' || 'single' }}"));
});

// Workflow simulation uses this repository's role; shared store fixtures stay reusable.
const workflowEnv = { ...ENV, RELEASE_APP: 'supplier', PLAY_PACKAGE: 'ph.gridgo.supplier' };

// Exercise the actual notice/save/upload order, env and conditions without
// running a build or a store upload. Only these three step types are simulated.
function runNoticeWorkflow(channel, { saveFails = false, uploadFails = false, branch = 'main', track = 'alpha' } = {}) {
  const play = channel === 'play';
  const path = play ? 'android-release.yml' : 'ios-testflight.yml';
  const queueName = play ? 'Queue the Play release notice' : 'Queue the TestFlight release notice';
  const saveName = play ? 'Save the pending Play notice' : 'Save the pending TestFlight notice';
  const workflow = readFileSync(new URL(`../.github/workflows/${path}`, import.meta.url), 'utf8');
  const steps = new Proxy({
    config: { outputs: { version: '1.0.42', code: '42', package: workflowEnv.PLAY_PACKAGE } },
    'play-track': { outputs: { track } },
    build: { outputs: { announce_version: '1.0.43', version: '1.0.0', build_number: '43' } },
  }, { get: (target, key) => target[key] ?? { outcome: '', outputs: {} } });
  const context = { steps, inputs: { submit_to_testflight: true }, vars: { ASC_APP_ID: ENV.ASC_APP_ID },
    github: { ref: `refs/heads/${branch}`, event: { inputs: { play_bundle: 'true', submit_to_play: 'true' } } } };
  const evaluate = expression => runInNewContext(expression.replace(/steps\.([\w-]+)/g, 'steps["$1"]'), context, { timeout: 100 });
  let failed = false;
  let queued;
  let persisted;
  let uploaded = false;
  for (const block of workflow.split(/(?=^      - )/m)) {
    const name = /^      - name: (.+)$/m.exec(block)?.[1];
    const upload = play ? name?.startsWith('Upload the Play bundle to ') : name === 'Upload to TestFlight';
    if (name !== queueName && name !== saveName && !upload) continue;
    const id = /^        id: (.+)$/m.exec(block)?.[1];
    const condition = /^        if: (.+)$/m.exec(block)?.[1] ?? 'true';
    let outcome = 'skipped';
    if (!failed && evaluate(condition)) {
      try {
        if (name === queueName) {
          const env = Object.fromEntries([...block.matchAll(/^          ([A-Z_]+): (.+)$/gm)].map(([, key, value]) =>
            [key, value.startsWith('${{') ? evaluate(value.slice(3, -2).trim()) : value]));
          queued = pendingRelease(env, NOW);
        } else if (name === saveName) {
          if (saveFails || !queued) throw new Error('Simulated pending artifact save failure');
          persisted = queued;
        } else {
          if (uploadFails) throw new Error('Simulated store upload failure');
          uploaded = true;
        }
        outcome = 'success';
      } catch {
        outcome = 'failure';
        if (!/^        continue-on-error: true$/m.test(block)) failed = true;
      }
    }
    if (id) steps[id] = { outcome };
  }
  return { uploaded, persisted, conclusion: failed ? 'failure' : 'success' };
}

test('failed pending persistence blocks upload; healthy retry and two later schedules deliver both notices', async () => {
  const mock = fixture();
  const outcomes = {};
  for (const [channel, id] of [['play', 201], ['ios', 202]]) {
    outcomes[channel] = runNoticeWorkflow(channel, { saveFails: true });
    // Reviewer regression: no artifact save must never coexist with a successful upload.
    assert.equal(outcomes[channel].uploaded, false, `${channel} uploaded without a durable pending record`);
    assert.equal(outcomes[channel].conclusion, 'failure');
    const workflow = channel === 'play' ? 'android-release.yml' : 'ios-testflight.yml';
    mock.state.overrides.set(`/repos/example/app/actions/workflows/${workflow}/runs`, () => response({ workflow_runs: [{
      id, head_branch: 'main', event: 'workflow_dispatch', path: `.github/workflows/${workflow}`,
      created_at: new Date(NOW - 1000).toISOString(), conclusion: outcomes[channel].conclusion,
    }] }));
    mock.state.overrides.set(`/repos/example/app/actions/runs/${id}/artifacts`, () => response({
      artifacts: outcomes[channel].persisted ? [{ id: channel === 'play' ? 301 : 302,
        name: `pending-store-release-${channel}`, expired: false, size_in_bytes: 500 }] : [],
    }));
  }
  // Healthy scheduling after a failed save cannot manufacture a notification.
  assert.deepEqual(await check(mock, { dryRun: false }), { pending: 0, available: 0, accepted: 0 });
  for (const channel of ['play', 'ios']) {
    outcomes[channel] = runNoticeWorkflow(channel); // retry once persistence is healthy
    assert.equal(outcomes[channel].uploaded, true);
    assert.equal(outcomes[channel].conclusion, 'success');
    mock.state.releases[channel] = outcomes[channel].persisted;
  }
  // The reviewer's two healthy passes, thirty minutes apart, now have durable records.
  for (const now of [NOW, NOW + 30 * 60 * 1000]) await checkStoreReleases(workflowEnv, { ...mock, now, dryRun: false });
  assert.equal(mock.state.notices.size, 2);
});

test('pre-upload pending records cannot announce after the store upload fails', async () => {
  const mock = fixture();
  for (const [channel, workflow] of [['play', 'android-release.yml'], ['ios', 'ios-testflight.yml']]) {
    const result = runNoticeWorkflow(channel, { uploadFails: true });
    assert.ok(result.persisted);
    assert.equal(result.uploaded, false);
    assert.equal(result.conclusion, 'failure');
    mock.state.overrides.set(`/repos/example/app/actions/workflows/${workflow}/runs`, () => response({ workflow_runs: [{
      id: channel === 'play' ? 201 : 202, head_branch: 'main', event: 'workflow_dispatch',
      path: `.github/workflows/${workflow}`, created_at: new Date(NOW - 1000).toISOString(), conclusion: result.conclusion,
    }] }));
  }
  assert.deepEqual(await check(mock, { dryRun: false }), { pending: 0, available: 0, accepted: 0 });
  assert.equal(mock.state.notices.size, 0);
});

test('internal Play and non-main store uploads retain their no-notice path', () => {
  for (const [channel, options] of [['play', { track: 'internal' }], ['play', { branch: 'feature' }], ['ios', { branch: 'feature' }]]) {
    const result = runNoticeWorkflow(channel, { ...options, saveFails: true });
    assert.equal(result.uploaded, true);
    assert.equal(result.persisted, undefined);
    assert.equal(result.conclusion, 'success');
  }
});
