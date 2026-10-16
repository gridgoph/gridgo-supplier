import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** What each channel's workflow has already published, for the messages below. */
const PUBLISHED = { apk: 'The APK', play: 'The Play upload', ios: 'The TestFlight upload' };

/**
 * Publishing already succeeded. Notification failures must remain advisory.
 *
 * RELEASE_CHANNEL names the install channel the notice is for (`play` after a
 * Google Play upload, `ios` after a TestFlight upload). Unset is the APK
 * release, and its body stays `{ app, version }` exactly as before.
 */
export async function announceRelease(env = process.env, fetchImpl = fetch) {
  const channel = (env.RELEASE_CHANNEL ?? '').trim();
  if (channel && !Object.hasOwn(PUBLISHED, channel)) return { level: 'warning', message: 'Release push skipped: RELEASE_CHANNEL must be apk, play or ios.' };
  const published = PUBLISHED[channel || 'apk'];
  if (!env.RELEASE_ANNOUNCE_TOKEN) return { level: 'notice', message: 'Release push skipped: RELEASE_ANNOUNCE_TOKEN is not set.' };
  try {
    const response = await fetchImpl('https://gridgo-api.talasora.com/release-announcements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RELEASE_ANNOUNCE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: env.RELEASE_APP, version: env.RELEASE_VERSION, ...(channel ? { channel } : {}) }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (response.ok) return { level: 'notice', message: 'Release push accepted (repeated versions do not send again).' };
    return { level: 'warning', message: `Release push failed (HTTP ${response.status}). ${published} is already published; retry the announcement through firstmate.` };
  } catch {
    // Do not print request headers, response bodies, or transport exceptions.
    return { level: 'warning', message: `Release push failed or timed out. ${published} is already published; retry the announcement through firstmate.` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await announceRelease();
  console.log(`::${result.level}::${result.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Release notification\n\n${result.level === 'warning' ? '**Warning:** ' : ''}${result.message}\n`);
  }
}
