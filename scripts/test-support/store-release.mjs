import { Buffer } from 'node:buffer';
import { generateKeyPairSync } from 'node:crypto';

export const NOW = Date.parse('2026-11-10T12:00:00Z');
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
export const PUBLIC_KEYS = { rsa: rsa.publicKey, ec: ec.publicKey };
export const ENV = {
  RELEASE_APP: 'client', PLAY_PACKAGE: 'ph.gridgo.client', ASC_APP_ID: '12345',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'test@example.invalid',
    private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
  ASC_API_KEY_P8: ec.privateKey.export({ type: 'pkcs8', format: 'pem' }), ASC_KEY_ID: 'test-key', ASC_ISSUER_ID: 'test-issuer',
  GITHUB_REPOSITORY: 'example/app', GITHUB_TOKEN: 'fake-github-token', RELEASE_ANNOUNCE_TOKEN: 'fake-announce-token',
};
export const PLAY_RELEASE = { app: 'client', version: '1.0.42', buildNumber: '42', channel: 'play',
  packageName: 'ph.gridgo.client', playTrack: 'alpha', queuedAt: new Date(NOW - 3600000).toISOString() };
export const IOS_RELEASE = { app: 'client', version: '1.0.43', buildNumber: '43', channel: 'ios', ascAppId: '12345',
  storeVersion: '1.0.0', queuedAt: PLAY_RELEASE.queuedAt };
export const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });

export function fixture() {
  const state = {
    lifecycle: Object.fromEntries(['alpha', 'internal'].map(track => [track, { releases: [{ track,
      releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_PUBLISHED', activeArtifacts: [{ versionCode: 42 }] }] }])),
    rollout: Object.fromEntries(['alpha', 'internal'].map(track => [track, { track, releases: [{ status: 'completed', versionCodes: ['42'] }] }])),
    builds: { data: [{ id: 'build-43', type: 'builds', attributes: { version: '43', processingState: 'VALID', expired: false,
      expirationDate: new Date(NOW + 86400000).toISOString() } }] },
    detail: { data: { attributes: { externalBuildState: 'IN_BETA_TESTING', internalBuildState: 'IN_BETA_TESTING' } } },
    review: { data: { attributes: { betaReviewState: 'APPROVED' } } },
    groups: { data: [{ id: 'external', attributes: { isInternalGroup: false } }, { id: 'internal', attributes: { isInternalGroup: true } }] },
    members: { external: { data: [{ type: 'builds', id: 'build-43' }] }, internal: { data: [{ type: 'builds', id: 'build-43' }] } },
    releases: { play: structuredClone(PLAY_RELEASE), ios: structuredClone(IOS_RELEASE) },
    overrides: new Map(), calls: [], notices: new Set(), announceStatus: 201,
  };
  const transport = async (url, options = {}) => {
    url = String(url);
    const path = new URL(url).pathname;
    state.calls.push({ url, options });
    if (state.overrides.has(url)) return state.overrides.get(url)(url, options);
    if (state.overrides.has(path)) return state.overrides.get(path)(url, options);
    if (url === 'https://oauth2.googleapis.com/token') return response({ access_token: 'fake-google-token' });
    if (url.startsWith('https://androidpublisher.googleapis.com/')) {
      const track = /\/tracks\/(alpha|internal)/.exec(path)?.[1];
      if (path.endsWith('/releases')) return response(state.lifecycle[track]);
      if (track) return response(state.rollout[track]);
      if (path.endsWith('/edits')) return response({ id: 'read-only-edit' });
      if (options.method === 'DELETE') return response(null, 204);
    }
    if (url.startsWith('https://api.appstoreconnect.apple.com/')) {
      if (path === '/v1/builds') return response(state.builds);
      if (path.endsWith('/buildBetaDetail')) return response(state.detail);
      if (path.endsWith('/betaAppReviewSubmission')) return response(state.review);
      if (path === '/v1/betaGroups') return response(state.groups);
      if (path.endsWith('/relationships/builds')) return response(state.members[path.split('/')[3]]);
    }
    if (url.startsWith('https://api.github.com/')) {
      const source = path.includes('android-release.yml') ? 'play' : 'ios';
      if (path.endsWith('/runs')) return response({ workflow_runs: [{ id: source === 'play' ? 201 : 202,
        head_branch: 'main', event: 'workflow_dispatch', conclusion: 'success',
        path: `.github/workflows/${source === 'play' ? 'android-release.yml' : 'ios-testflight.yml'}`,
        created_at: new Date(NOW - 7200000).toISOString() }] });
      if (path.endsWith('/artifacts')) return response({ artifacts: [{ id: path.includes('/201/') ? 301 : 302,
        name: `pending-store-release-${path.includes('/201/') ? 'play' : 'ios'}`, expired: false, size_in_bytes: 500 }] });
      if (path.endsWith('/zip')) return { status: 302, headers: new Headers({ location: `https://artifacts.example.invalid/${path.includes('/301/') ? 'play' : 'ios'}` }) };
      if (options.method === 'DELETE') return response(null, 204);
    }
    if (url.startsWith('https://artifacts.example.invalid/')) return { ok: true,
      arrayBuffer: async () => Buffer.from(JSON.stringify(state.releases[path.slice(1)])) };
    if (url === 'https://gridgo-api.talasora.com/release-announcements') {
      if (state.announceStatus < 300) state.notices.add(options.body);
      return response({}, state.announceStatus);
    }
    throw new Error(`Unexpected mock request: ${url}`);
  };
  return { state, transport, readArtifact: async bytes => JSON.parse(Buffer.from(bytes).toString()) };
}
