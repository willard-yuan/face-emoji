#!/usr/bin/env node
// IndexNow submitter for emojiface.us
// Usage:
//   npm run indexnow                                  submit every URL in sitemap.xml
//   npm run indexnow -- --urls=https://emojiface.us/a.html,https://emojiface.us/b.html
//   npm run indexnow -- --dry                         print the payload without sending
// The key file must be publicly reachable at https://emojiface.us/<key>.txt before submitting.

import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'emojiface.us';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS = 10000;
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const urlsArg = args.find((a) => a.startsWith('--urls='));

async function findKeyFile() {
  const names = (await readdir(ROOT))
    .filter((n) => /^[A-Za-z0-9_-]{8,128}\.txt$/.test(n))
    .sort();
  for (const name of names) {
    const stem = name.slice(0, -4);
    const content = (await readFile(path.join(ROOT, name), 'utf8')).trim();
    // A real IndexNow key file contains only its own filename stem.
    if (content === stem) {
      return { key: content, keyLocation: `https://${HOST}/${name}` };
    }
  }
  throw new Error('No valid IndexNow key file found in the project root.');
}

async function collectUrls() {
  if (urlsArg) {
    return urlsArg
      .slice('--urls='.length)
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
  }
  const xml = await readFile(path.join(ROOT, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => u.startsWith(`https://${HOST}/`) && !u.includes('#'));
}

async function post(body) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { status: response.status, text: await response.text(), via: 'fetch' };
  } catch (error) {
    // Node fetch does not honor HTTP(S)_PROXY; curl does, so use it as fallback.
    const out = execFileSync(
      'curl',
      ['-sS', '-X', 'POST', '-H', 'content-type: application/json; charset=utf-8',
        '--data-binary', body, '-w', '\n%{http_code}', '--max-time', '20', ENDPOINT],
      { encoding: 'utf8' },
    );
    const split = out.lastIndexOf('\n');
    return {
      status: Number(out.slice(split + 1).trim()),
      text: out.slice(0, split),
      via: `curl (fetch failed: ${error.message})`,
    };
  }
}

const { key, keyLocation } = await findKeyFile();
const urlList = await collectUrls();
if (!urlList.length) throw new Error('No URLs to submit.');
if (urlList.length > MAX_URLS) throw new Error(`IndexNow allows at most ${MAX_URLS} URLs per request.`);

const payload = { host: HOST, key, keyLocation, urlList };
if (dry) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const result = await post(JSON.stringify(payload));
console.log(`IndexNow: ${urlList.length} URL(s) -> ${ENDPOINT} via ${result.via}`);
console.log(`HTTP ${result.status}${result.text ? ` ${result.text.slice(0, 200)}` : ''}`);
// 200 = OK, 202 = Accepted. Both mean the submission was received.
if (![200, 202].includes(result.status)) {
  console.error('IndexNow submission was not accepted. Verify the key file is live, then retry.');
  process.exitCode = 1;
}
