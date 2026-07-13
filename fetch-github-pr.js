#!/usr/bin/env node

/**
 * Fetch a GitHub pull request and its related data without third-party packages.
 * Requires Node.js 18 or newer for the built-in fetch API.
 */

const DEFAULT_PR_URL = 'https://github.com/vuejs/core/pull/15125';
const DEFAULT_OUTPUT = 'vue-core-pr-15125.json';
const API_ORIGIN = 'https://api.github.com';

function getToken() {
  return process.env.GITHUB_TOKENS
    ?.split(',')
    .map((token) => token.trim())
    .find(Boolean) || null;
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_PR_URL,
    output: DEFAULT_OUTPUT,
    token: getToken(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      printUsage();
      process.exit(0);
    }

    if (argument === '--token') {
      const token = argv[++index];
      if (!token || token.startsWith('-')) {
        throw new Error('--token requires a value.');
      }
      options.token = token;
      continue;
    }

    if (argument === '--output' || argument === '-o') {
      const output = argv[++index];
      if (!output || output.startsWith('-')) {
        throw new Error(`${argument} requires a file path.`);
      }
      options.output = output;
      continue;
    }

    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }

    options.url = argument;
  }

  return options;
}

function parsePullRequestUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid GitHub pull request URL: ${value}`);
  }

  if (parsed.hostname !== 'github.com') {
    throw new Error('The URL must use the github.com host.');
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length !== 4 || parts[2] !== 'pull' || !/^\d+$/.test(parts[3])) {
    throw new Error('Expected a URL in the form https://github.com/<owner>/<repo>/pull/<number>.');
  }

  return {
    owner: parts[0],
    repo: parts[1],
    number: parts[3],
  };
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;

  const nextLink = linkHeader
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.endsWith('; rel="next"'));

  if (!nextLink) return null;
  return nextLink.match(/^<([^>]+)>/)?.[1] || null;
}

async function githubRequest(url, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'github-pr-fetcher',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      message = JSON.parse(body).message || body;
    } catch {
      // Keep the response text when GitHub does not return JSON.
    }
    throw new Error(`GitHub API ${response.status} ${response.statusText}: ${message}`);
  }

  return { data: await response.json(), next: parseNextLink(response.headers.get('link')) };
}

async function fetchAll(path, token) {
  const items = [];
  let next = `${API_ORIGIN}${path}${path.includes('?') ? '&' : '?'}per_page=100`;

  while (next) {
    const result = await githubRequest(next, token);
    if (!Array.isArray(result.data)) {
      throw new Error(`Expected an array from ${next}`);
    }
    items.push(...result.data);
    next = result.next;
  }

  return items;
}

async function fetchPullRequest(url, token) {
  const { owner, repo, number } = parsePullRequestUrl(url);
  const basePath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const pullPath = `${basePath}/pulls/${number}`;

  const pullRequest = (await githubRequest(`${API_ORIGIN}${pullPath}`, token)).data;
  const [commits, files, issueComments, reviews, reviewComments] = await Promise.all([
    fetchAll(`${pullPath}/commits`, token),
    fetchAll(`${pullPath}/files`, token),
    fetchAll(`${basePath}/issues/${number}/comments`, token),
    fetchAll(`${pullPath}/reviews`, token),
    fetchAll(`${pullPath}/comments`, token),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    source: url,
    pullRequest,
    commits,
    files,
    issueComments,
    reviews,
    reviewComments,
  };
}

function printUsage() {
  console.log(`Usage: node fetch-github-pr.js [pull-request-url] [options]

Options:
  -o, --output <file>  Output file; defaults to the script directory
      --token <token>  Override the first token from GITHUB_TOKENS
  -h, --help           Show this help

Default URL:
  ${DEFAULT_PR_URL}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await fetchPullRequest(options.url, options.token);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const path = await import('node:path');
  const output = path.isAbsolute(options.output)
    ? options.output
    : path.join(__dirname, options.output);

  const fs = await import('node:fs/promises');
  await fs.writeFile(output, json, 'utf8');
  console.log(`Saved full GitHub PR data to ${output}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
