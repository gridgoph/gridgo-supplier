import { Buffer } from 'node:buffer';
/** Store reads only. Missing fields, unknown states and errors never prove availability. */
import { sign } from 'node:crypto';
import { serviceAccountAssertion } from './play-release-notes.mjs';

const PLAY = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const ASC = 'https://api.appstoreconnect.apple.com';
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Store notices target closed testing. Internal-only uploads never announce.
export const PLAY_NOTICE_TRACK = 'alpha';

export function validPendingRelease(release, env, now = Date.now()) {
  if (!release || release.app !== env.RELEASE_APP || !['play', 'ios'].includes(release.channel)) return false;
  if (typeof release.version !== 'string' || !/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.[1-9]\d{0,8}$/.test(release.version)) return false;
  if (typeof release.buildNumber !== 'string' || !/^[1-9]\d{0,8}$/.test(release.buildNumber)) return false;
  if (release.version.split('.')[2] !== release.buildNumber) return false;
  const age = typeof release.queuedAt === 'string' ? now - Date.parse(release.queuedAt) : NaN;
  if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE_MS) return false;
  return release.channel === 'play'
    ? release.packageName === env.PLAY_PACKAGE && Boolean(env.PLAY_PACKAGE) && release.playTrack === PLAY_NOTICE_TRACK
    : release.ascAppId === env.ASC_APP_ID && Boolean(env.ASC_APP_ID) && typeof release.storeVersion === 'string' &&
      /^\d+\.\d+\.\d+$/.test(release.storeVersion) &&
      release.storeVersion.split('.').slice(0, 2).join('.') === release.version.split('.').slice(0, 2).join('.');
}

async function jsonRequest(transport, url, token, method = 'GET', body) {
  const response = await transport(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  // Never log response bodies or transport errors: they can contain credentials.
  if (!response.ok) throw new Error(`Store read failed (HTTP ${response.status})`);
  return method === 'DELETE' ? null : response.json();
}

export function playReleasePublished(response, track, code) {
  return Array.isArray(response?.releases) && response.releases.some(release =>
    release.track === track && release.releaseLifecycleState === 'RELEASE_LIFECYCLE_STATE_PUBLISHED' &&
    release.activeArtifacts?.some(artifact => artifact.versionCode === Number(code)));
}

export function playReleaseFullyRolledOut(response, track, code) {
  return response?.track === track && Array.isArray(response.releases) && response.releases.some(release =>
    release.status === 'completed' && release.userFraction === undefined &&
    release.versionCodes?.includes(code));
}

export async function playAvailable(release, env, transport = fetch) {
  if (release.playTrack !== PLAY_NOTICE_TRACK) return false;
  const key = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  // A key's token_uri must not redirect credentials to an arbitrary origin.
  const oauth = await transport('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: serviceAccountAssertion({ ...key, token_uri: 'https://oauth2.googleapis.com/token' }) }),
    signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  if (!oauth.ok) return false;
  const { access_token: token } = await oauth.json();
  if (!token) return false;
  const base = `${PLAY}/${encodeURIComponent(release.packageName)}`;
  const track = release.playTrack;
  const lifecycle = await jsonRequest(transport, `${base}/tracks/${track}/releases`, token);
  if (!playReleasePublished(lifecycle, track, release.buildNumber)) return false;
  // PUBLISHED also includes partial/halted releases. Read a disposable edit to
  // require completed rollout. Never commit it, upload, promote or submit anything.
  const edit = await jsonRequest(transport, `${base}/edits`, token, 'POST', {});
  if (!edit.id) return false;
  const editUrl = `${base}/edits/${encodeURIComponent(edit.id)}`;
  try {
    const rollout = await jsonRequest(transport, `${editUrl}/tracks/${track}`, token);
    return playReleaseFullyRolledOut(rollout, track, release.buildNumber);
  } finally {
    await jsonRequest(transport, editUrl, token, 'DELETE');
  }
}

export function appStoreToken(env, now = Date.now()) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' })}.${encode({
    iss: env.ASC_ISSUER_ID, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 600, aud: 'appstoreconnect-v1',
  })}`;
  return `${input}.${sign('sha256', Buffer.from(input), { key: env.ASC_API_KEY_P8, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

async function appleList(path, token, transport) {
  const rows = [];
  let url = new URL(path, ASC).href;
  const seen = new Set();
  while (url) {
    if (new URL(url).origin !== ASC || seen.has(url) || seen.size >= 100) throw new Error('Invalid store pagination');
    seen.add(url);
    const response = await jsonRequest(transport, url, token);
    if (!Array.isArray(response.data)) throw new Error('Missing store data');
    rows.push(...response.data);
    url = response.links?.next ? new URL(response.links.next, ASC).href : null;
  }
  return rows;
}

export async function iosAvailable(release, env, transport = fetch, now = Date.now()) {
  const token = appStoreToken(env, now);
  const params = new URLSearchParams({ 'filter[app]': release.ascAppId, 'filter[version]': release.buildNumber,
    'filter[preReleaseVersion.version]': release.storeVersion, limit: '200' });
  const builds = await appleList(`/v1/builds?${params}`, token, transport);
  if (builds.length !== 1) return false;
  const build = builds[0];
  if (!build.id || build.attributes?.version !== release.buildNumber || build.attributes.processingState !== 'VALID' ||
    build.attributes.expired !== false || !(Date.parse(build.attributes.expirationDate) > now)) return false;
  const base = `${ASC}/v1/builds/${encodeURIComponent(build.id)}`;
  const detail = await jsonRequest(transport, `${base}/buildBetaDetail`, token);
  const review = await jsonRequest(transport, `${base}/betaAppReviewSubmission`, token);
  if (detail.data?.attributes?.externalBuildState !== 'IN_BETA_TESTING' ||
    review.data?.attributes?.betaReviewState !== 'APPROVED') return false;
  // Require an assigned external audience. Groups intentionally left without
  // this build are not targets; check readiness for every group it does reach.
  const groups = await appleList(`/v1/betaGroups?${new URLSearchParams({ 'filter[app]': release.ascAppId, limit: '200' })}`, token, transport);
  let externalAssigned = false;
  for (const group of groups) {
    if (!group.id) return false;
    const members = await appleList(`/v1/betaGroups/${encodeURIComponent(group.id)}/relationships/builds?limit=200`, token, transport);
    if (!members.some(member => member.type === 'builds' && member.id === build.id)) continue;
    const internal = group.attributes?.isInternalGroup;
    if (typeof internal !== 'boolean') return false;
    if (internal && detail.data.attributes.internalBuildState !== 'IN_BETA_TESTING') return false;
    if (!internal) externalAssigned = true;
  }
  return externalAssigned;
}

export async function storeAvailable(release, env, transport = fetch, now = Date.now()) {
  if (!validPendingRelease(release, env, now)) return false;
  try {
    return release.channel === 'play' ? await playAvailable(release, env, transport) : await iosAvailable(release, env, transport, now);
  } catch {
    return false;
  }
}
