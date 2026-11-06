import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PLAY_NOTES_LIMIT,
  notesForVersion,
  publishPlayBundle,
  releaseNotesText,
  serviceAccountAssertion,
  setPlayReleaseNotes,
  withReleaseNotes,
} from './play-release-notes.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = {
  type: 'service_account',
  client_email: 'publisher@example.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token',
};

test('notes read newest first, one bullet each', () => {
  assert.equal(releaseNotesText(['Oldest change.', 'Newest change.']), '• Newest change.\n• Oldest change.');
});

test('notes stay within Play\'s limit in whole lines and say when there is more', () => {
  const notes = Array.from({ length: 16 }, (_, i) => `Change ${i} `.padEnd(110, 'x') + '.');
  const text = releaseNotesText(notes);
  assert.ok([...text].length <= PLAY_NOTES_LIMIT);
  const lines = text.split('\n');
  assert.equal(lines.at(-1), '• And more improvements in this version.');
  assert.equal(lines[0], `• ${notes[15]}`);
  for (const line of lines.slice(0, -1)) assert.ok(notes.map((n) => `• ${n}`).includes(line));
});

test('notes that fit are all kept, with no "more" line', () => {
  const text = releaseNotesText(['A.', 'B.', 'C.']);
  assert.ok(!text.includes('And more'));
  assert.equal(text.split('\n').length, 3);
});

test('a version with no notes still tells testers something', () => {
  assert.equal(releaseNotesText([]), 'Fixes and improvements.');
});

test('a build takes its pending notes, else the newest recorded release', () => {
  const root = mkdtempSync(join(tmpdir(), 'play-notes-'));
  writeFileSync(
    join(root, 'WHATS_NEW.md'),
    '# x\n\n<!-- CI adds each release below this line. -->\n\n## 1.0.9 (Fix)\n\n- Recorded fix.\n\n## 1.0.8\n\n- Older.\n',
  );
  assert.deepEqual(notesForVersion(root, '1.0.12'), ['Recorded fix.']);
  mkdirSync(join(root, 'whats-new'));
  writeFileSync(join(root, 'whats-new', '300-thing.md'), 'Kind: feature\n- Pending feature.\n');
  assert.deepEqual(notesForVersion(root, '1.0.12'), ['Pending feature.']);
});

test('the notes go on the release with that versionCode only', () => {
  const track = {
    track: 'internal',
    releases: [
      { name: 'old', versionCodes: ['300'], status: 'completed' },
      { name: 'new', versionCodes: ['302'], status: 'completed' },
    ],
  };
  const updated = withReleaseNotes(track, 302, 'Notes');
  assert.deepEqual(updated.releases[0], track.releases[0]);
  assert.deepEqual(updated.releases[1].releaseNotes, [{ language: 'en-US', text: 'Notes' }]);
  assert.throws(() => withReleaseNotes(track, 999, 'Notes'), /no release with versionCode 999/);
});

test('the service-account assertion is signed with the key for the Play scope', () => {
  const [header, claims, signature] = serviceAccountAssertion(key, 1000).split('.');
  const verify = createVerify('RSA-SHA256');
  verify.update(`${header}.${claims}`);
  assert.ok(verify.verify(publicKey, signature, 'base64url'));
  const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
  assert.equal(body.scope, 'https://www.googleapis.com/auth/androidpublisher');
  assert.equal(body.iss, key.client_email);
  assert.equal(body.exp - body.iat, 600);
});

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/ph.gridgo.supplier';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/ph.gridgo.supplier';

/** A fake Play: internal and alpha tracks, edits that commit on request, bundles that upload. */
function fakePlay({ commitNeedsFlag = false, commitStatus = 200, tokenStatus = 200, uploadStatus = 200, bundleCode = 302 } = {}) {
  const calls = [];
  let committed = {
    internal: { track: 'internal', releases: [{ name: '1.0.302', versionCodes: ['302'], status: 'completed' }] },
    alpha: { track: 'alpha', releases: [{ name: '1.0.290', versionCodes: ['290'], status: 'completed' }] },
  };
  const edits = new Map();
  let next = 1;
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const transport = async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers, body: options.body });
    if (url.startsWith('https://oauth2')) return json(tokenStatus, tokenStatus === 200 ? { access_token: 'tok' } : { error: 'tok-in-error' });
    let m = /^\/edits\/(\w+)\/bundles\?uploadType=media$/.exec(url.startsWith(UPLOAD) ? url.slice(UPLOAD.length) : '');
    if (m && options.method === 'POST') {
      if (uploadStatus !== 200) return json(uploadStatus, { error: { message: 'The caller does not have permission' } });
      return json(200, { versionCode: bundleCode, sha256: 'abc' });
    }
    const path = url.replace(API, '');
    if (options.method === 'POST' && path === '/edits') {
      const id = `e${next++}`;
      edits.set(id, structuredClone(committed));
      return json(200, { id });
    }
    m = /^\/edits\/(\w+)\/tracks\/(internal|alpha)$/.exec(path);
    if (m && options.method === 'GET') return json(200, edits.get(m[1])[m[2]]);
    if (m && options.method === 'PUT') {
      edits.get(m[1])[m[2]] = JSON.parse(options.body);
      return json(200, JSON.parse(options.body));
    }
    m = /^\/edits\/(\w+):commit(\?changesNotSentForReview=true)?$/.exec(path);
    if (m) {
      if (commitNeedsFlag && !m[2]) return json(400, { error: { message: 'Changes are sent for review automatically. changesNotSentForReview must be set.' } });
      if (commitStatus !== 200) return json(commitStatus, { error: { message: 'Something went wrong' } });
      committed = edits.get(m[1]);
      return json(200, { id: m[1] });
    }
    if (options.method === 'DELETE') return json(204, {});
    return json(404, { error: { message: 'not found' } });
  };
  /** Each Play call as "METHOD path", edit ids kept, the token exchange left out. */
  const steps = () =>
    calls.filter((call) => !call.url.startsWith('https://oauth2')).map((call) => `${call.method} ${call.url.replace(UPLOAD, 'upload:').replace(API, '')}`);
  return { transport, calls, steps, committed: (track = 'internal') => committed[track] };
}

test('sets the notes through an edit, commits, and reads them back', async () => {
  const play = fakePlay();
  const stored = await setPlayReleaseNotes(
    { key, packageName: 'ph.gridgo.supplier', track: 'internal', versionCode: '302', text: '• Something new.' },
    play.transport,
  );
  assert.equal(stored, '• Something new.');
  assert.deepEqual(play.committed().releases[0].releaseNotes, [{ language: 'en-US', text: '• Something new.' }]);
  assert.equal(play.calls.at(-1).method, 'DELETE');
  assert.ok(play.calls.slice(1).every((call) => call.headers.authorization === 'Bearer tok'));
});

test('retries the commit with changesNotSentForReview only when Play asks for it', async () => {
  const play = fakePlay({ commitNeedsFlag: true });
  const stored = await setPlayReleaseNotes(
    { key, packageName: 'ph.gridgo.supplier', track: 'internal', versionCode: 302, text: 'Notes' },
    play.transport,
  );
  assert.equal(stored, 'Notes');
  assert.ok(play.calls.some((call) => call.url.endsWith(':commit?changesNotSentForReview=true')));
});

test('a refused service account fails with the status only', async () => {
  const play = fakePlay({ tokenStatus: 401 });
  await assert.rejects(
    setPlayReleaseNotes({ key, packageName: 'ph.gridgo.supplier', versionCode: 302, text: 'x' }, play.transport),
    (error) => /HTTP 401/.test(error.message) && !error.message.includes('tok-in-error'),
  );
});

const bundle = Buffer.from('PK\u0003\u0004 not really an aab');
const release = { key, packageName: 'ph.gridgo.supplier', versionCode: '303', text: '• Something new.', bundle };

test('uploads the bundle as raw bytes to the edit\'s media upload endpoint', async () => {
  const play = fakePlay({ bundleCode: 303 });
  await publishPlayBundle(release, play.transport);
  const upload = play.calls.find((call) => call.url.includes('/bundles'));
  assert.equal(upload.url, `${UPLOAD}/edits/e1/bundles?uploadType=media`);
  assert.equal(upload.method, 'POST');
  assert.equal(upload.headers['content-type'], 'application/octet-stream');
  assert.equal(upload.headers.authorization, 'Bearer tok');
  assert.equal(upload.body, bundle);
});

test('uploads, sets the track with notes, and commits in one edit, then reads back', async () => {
  const play = fakePlay({ bundleCode: 303 });
  const stored = await publishPlayBundle(release, play.transport);
  assert.equal(stored, '• Something new.');
  assert.deepEqual(play.steps(), [
    'POST /edits',
    'POST upload:/edits/e1/bundles?uploadType=media',
    'PUT /edits/e1/tracks/alpha',
    'POST /edits/e1:commit',
    'POST /edits',
    'GET /edits/e2/tracks/alpha',
    'DELETE /edits/e2',
  ]);
  const put = play.calls.find((call) => call.method === 'PUT');
  assert.deepEqual(JSON.parse(put.body), {
    track: 'alpha',
    releases: [{ versionCodes: ['303'], status: 'completed', releaseNotes: [{ language: 'en-US', text: '• Something new.' }] }],
  });
  assert.deepEqual(play.committed('alpha').releases, JSON.parse(put.body).releases);
  assert.deepEqual(play.committed('internal').releases[0].versionCodes, ['302']);
});

test('uploads to internal testing when that track is asked for', async () => {
  const play = fakePlay({ bundleCode: 303 });
  await publishPlayBundle({ ...release, track: 'internal' }, play.transport);
  assert.ok(play.steps().includes('PUT /edits/e1/tracks/internal'));
  assert.deepEqual(play.committed('internal').releases[0].versionCodes, ['303']);
});

test('retries the bundle commit with changesNotSentForReview when Play asks for it', async () => {
  const play = fakePlay({ bundleCode: 303, commitNeedsFlag: true });
  assert.equal(await publishPlayBundle(release, play.transport), '• Something new.');
  assert.deepEqual(
    play.steps().filter((step) => step.includes(':commit')),
    ['POST /edits/e1:commit', 'POST /edits/e1:commit?changesNotSentForReview=true'],
  );
});

test('a refused upload fails with Play\'s message, commits nothing and drops the edit', async () => {
  const play = fakePlay({ uploadStatus: 403 });
  await assert.rejects(
    publishPlayBundle(release, play.transport),
    (error) =>
      error.message === 'Play API POST /edits/…/bundles: HTTP 403 The caller does not have permission' &&
      error.status === 403 &&
      !error.message.includes('tok'),
  );
  assert.deepEqual(play.steps(), ['POST /edits', 'POST upload:/edits/e1/bundles?uploadType=media', 'DELETE /edits/e1']);
  assert.deepEqual(play.committed('alpha').releases[0].versionCodes, ['290']);
});

test('a bundle with another versionCode is never put on the track', async () => {
  const play = fakePlay({ bundleCode: 299 });
  await assert.rejects(publishPlayBundle(release, play.transport), /versionCode 299 from the bundle, not 303/);
  assert.ok(!play.steps().some((step) => step.startsWith('PUT') || step.includes(':commit')));
  assert.equal(play.steps().at(-1), 'DELETE /edits/e1');
});

test('a failed commit fails the upload without a read-back', async () => {
  const play = fakePlay({ bundleCode: 303, commitStatus: 500 });
  await assert.rejects(publishPlayBundle(release, play.transport), /:commit: HTTP 500 Something went wrong/);
  assert.equal(play.steps().filter((step) => step.includes(':commit')).length, 1);
  assert.ok(!play.steps().includes('GET /edits/e2/tracks/alpha'));
  assert.deepEqual(play.committed('alpha').releases[0].versionCodes, ['290']);
});

test('a refused service account uploads nothing', async () => {
  const play = fakePlay({ tokenStatus: 401 });
  await assert.rejects(publishPlayBundle(release, play.transport), (error) => /HTTP 401/.test(error.message) && !error.message.includes('tok-in-error'));
  assert.deepEqual(play.steps(), []);
});
