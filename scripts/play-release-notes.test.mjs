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

/** A fake Play: one internal track, edits that commit on request. */
function fakePlay({ commitNeedsFlag = false, tokenStatus = 200 } = {}) {
  const calls = [];
  let committed = { track: 'internal', releases: [{ name: '1.0.302', versionCodes: ['302'], status: 'completed' }] };
  const edits = new Map();
  let next = 1;
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const transport = async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers });
    if (url.startsWith('https://oauth2')) return json(tokenStatus, tokenStatus === 200 ? { access_token: 'tok' } : { error: 'tok-in-error' });
    const path = url.replace('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/ph.gridgo.supplier', '');
    if (options.method === 'POST' && path === '/edits') {
      const id = `e${next++}`;
      edits.set(id, structuredClone(committed));
      return json(200, { id });
    }
    let m = /^\/edits\/(\w+)\/tracks\/internal$/.exec(path);
    if (m && options.method === 'GET') return json(200, edits.get(m[1]));
    if (m && options.method === 'PUT') {
      edits.set(m[1], JSON.parse(options.body));
      return json(200, JSON.parse(options.body));
    }
    m = /^\/edits\/(\w+):commit(\?changesNotSentForReview=true)?$/.exec(path);
    if (m) {
      if (commitNeedsFlag && !m[2]) return json(400, { error: { message: 'Changes are sent for review automatically. changesNotSentForReview must be set.' } });
      committed = edits.get(m[1]);
      return json(200, { id: m[1] });
    }
    if (options.method === 'DELETE') return json(204, {});
    return json(404, { error: { message: 'not found' } });
  };
  return { transport, calls, committed: () => committed };
}

test('sets the notes through an edit, commits, and reads them back', async () => {
  const play = fakePlay();
  const stored = await setPlayReleaseNotes(
    { key, packageName: 'ph.gridgo.supplier', versionCode: '302', text: '• Something new.' },
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
    { key, packageName: 'ph.gridgo.supplier', versionCode: 302, text: 'Notes' },
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
