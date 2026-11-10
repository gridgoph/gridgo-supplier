/** Write non-secret build metadata for durable persistence BEFORE store upload. Never sends. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validPendingRelease } from './store-availability.mjs';

export function pendingRelease(env = process.env, now = Date.now()) {
  const release = {
    app: env.RELEASE_APP, channel: env.RELEASE_CHANNEL, version: env.RELEASE_VERSION,
    buildNumber: env.RELEASE_BUILD_NUMBER, queuedAt: new Date(now).toISOString(),
    ...(env.RELEASE_CHANNEL === 'play' ? { packageName: env.PLAY_PACKAGE, playTrack: env.PLAY_TRACK } : {
      ascAppId: env.ASC_APP_ID, storeVersion: env.RELEASE_STORE_VERSION,
    }),
  };
  if (!validPendingRelease(release, env, now)) throw new Error('Invalid pending store release');
  return release;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const release = pendingRelease();
    const output = process.argv[2];
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(release)}\n`);
    console.log('Store notification queued for availability checks; no push sent.');
  } catch {
    console.error('Could not queue store notification; no push sent.');
    process.exitCode = 1;
  }
}
