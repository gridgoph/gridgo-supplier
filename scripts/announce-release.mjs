import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Publishing already succeeded. Notification failures must remain advisory. */
export async function announceRelease(env = process.env, fetchImpl = fetch) {
  if (!env.RELEASE_ANNOUNCE_TOKEN) return { level: 'notice', message: 'Release push skipped: RELEASE_ANNOUNCE_TOKEN is not set.' };
  try {
    const response = await fetchImpl('https://gridgo-api.talasora.com/release-announcements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RELEASE_ANNOUNCE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: env.RELEASE_APP, version: env.RELEASE_VERSION }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (response.ok) return { level: 'notice', message: 'Release push accepted (repeated versions do not send again).' };
    return { level: 'warning', message: `Release push failed (HTTP ${response.status}). The APK is already published; retry the announcement through firstmate.` };
  } catch {
    // Do not print request headers, response bodies, or transport exceptions.
    return { level: 'warning', message: 'Release push failed or timed out. The APK is already published; retry the announcement through firstmate.' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await announceRelease();
  console.log(`::${result.level}::${result.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Release notification\n\n${result.level === 'warning' ? '**Warning:** ' : ''}${result.message}\n`);
  }
}
