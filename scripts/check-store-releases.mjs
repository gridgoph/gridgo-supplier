/** Scheduled runner. Only --send enables announcements; dry runs never POST to GRIDGO. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { announceRelease } from './announce-release.mjs';
import { MAX_AGE_MS, storeAvailable, validPendingRelease } from './store-availability.mjs';

const SOURCES = [
  { workflow: 'android-release.yml', channel: 'play' },
  { workflow: 'ios-testflight.yml', channel: 'ios' },
];

function githubClient(env, transport) {
  const base = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}`;
  return async (path, { method = 'GET', redirect = 'error' } = {}) => {
    const response = await transport(`${base}${path}`, {
      method, redirect, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok && !(redirect === 'manual' && response.status === 302)) throw new Error('GitHub request failed');
    return response;
  };
}

export async function readReleaseArtifact(bytes) {
  if (bytes.byteLength > 65536) throw new Error('Oversized pending artifact');
  const dir = await mkdtemp(join(tmpdir(), 'gridgo-release-'));
  try {
    const zip = join(dir, 'pending.zip');
    await writeFile(zip, new Uint8Array(bytes));
    // Read ONE bounded member; never extract paths or execute artifact code.
    return JSON.parse(execFileSync('unzip', ['-p', zip, 'release.json'], { encoding: 'utf8', maxBuffer: 16384, stdio: ['ignore', 'pipe', 'ignore'] }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Only trusted main upload runs produce pending records; no PR artifacts/code. */
export async function pendingArtifacts(env, transport = fetch, now = Date.now(), readArtifact = readReleaseArtifact) {
  const request = githubClient(env, transport);
  const pending = [];
  const since = new Date(now - MAX_AGE_MS).toISOString();
  for (const source of SOURCES) {
    for (let page = 1; page <= 10; page++) {
      const query = new URLSearchParams({ branch: 'main', event: 'workflow_dispatch', status: 'success',
        created: `>=${since}`, per_page: '100', page: String(page) });
      const runs = await (await request(`/actions/workflows/${source.workflow}/runs?${query}`)).json();
      if (!Array.isArray(runs.workflow_runs)) throw new Error('Missing workflow runs');
      for (const run of runs.workflow_runs) {
        const age = now - Date.parse(run.created_at);
        if (run.head_branch !== 'main' || run.event !== 'workflow_dispatch' || run.conclusion !== 'success' ||
          run.path !== `.github/workflows/${source.workflow}` || !Number.isFinite(age) || age < 0 || age >= MAX_AGE_MS) continue;
        const artifacts = await (await request(`/actions/runs/${Number(run.id)}/artifacts?per_page=100`)).json();
        for (const artifact of artifacts.artifacts ?? []) {
          if (artifact.name !== `pending-store-release-${source.channel}` || artifact.expired || artifact.size_in_bytes > 65536) continue;
          try {
            const response = await request(`/actions/artifacts/${Number(artifact.id)}/zip`, { redirect: 'manual' });
            if (response.status !== 302) continue;
            const location = new URL(response.headers.get('location'));
            if (location.protocol !== 'https:') continue;
            // The signed download URL needs NO GitHub bearer. Never forward it.
            const download = await transport(location.href, { redirect: 'error', signal: AbortSignal.timeout(15000) });
            if (!download.ok) continue;
            const release = await readArtifact(await download.arrayBuffer());
            if (release.channel === source.channel && validPendingRelease(release, env, now)) pending.push({ id: artifact.id, release });
          } catch {
            // Corrupt/missing/expired artifact: skip, never announce from a guess.
          }
        }
      }
      if (runs.workflow_runs.length < 100) break;
    }
  }
  return pending;
}

export async function checkStoreReleases(env = process.env, { transport = fetch, now = Date.now(), dryRun = true,
  readArtifact = readReleaseArtifact } = {}) {
  const pending = await pendingArtifacts(env, transport, now, readArtifact);
  const counts = { pending: pending.length, available: 0, accepted: 0 };
  for (const { id, release } of pending) {
    if (!await storeAvailable(release, env, transport, now)) continue;
    counts.available++;
    if (dryRun) continue;
    const result = await announceRelease({ ...env, RELEASE_CHANNEL: release.channel, RELEASE_VERSION: release.version },
      transport, { availabilityConfirmed: true });
    if (!result.accepted) continue;
    counts.accepted++;
    try {
      await githubClient(env, transport)(`/actions/artifacts/${Number(id)}`, { method: 'DELETE' });
    } catch {
      // API de-duplicates app/version/channel if artifact cleanup needs a retry.
    }
  }
  return counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3 || !['--send', '--dry-run'].includes(process.argv[2])) throw new Error('Expected mode');
    const dryRun = process.argv[2] !== '--send';
    const counts = await checkStoreReleases(process.env, { dryRun });
    console.log(`${dryRun ? 'Dry run' : 'Store check'}: ${JSON.stringify(counts)}`);
  } catch {
    console.error('Store check could not finish; unconfirmed releases were not announced.');
    process.exitCode = 1;
  }
}
