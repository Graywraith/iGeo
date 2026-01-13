import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function tryExec(command) {
    try {
        return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return undefined;
    }
}

function readPackageVersion() {
    try {
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const raw = fs.readFileSync(packageJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        return typeof parsed.version === 'string' ? parsed.version : undefined;
    } catch {
        return undefined;
    }
}

const appVersion = process.env.PUBLIC_APP_VERSION || process.env.npm_package_version || readPackageVersion() || '0.0.0';

const buildDate = process.env.PUBLIC_BUILD_DATE || new Date().toISOString().slice(0, 10);

const gitCommitCount = tryExec('git rev-list --count HEAD');
const gitShortSha = tryExec('git rev-parse --short HEAD');

const buildNumber =
    process.env.PUBLIC_BUILD_NUMBER ||
    process.env.NETLIFY_BUILD_NUMBER ||
    process.env.NETLIFY_BUILD_ID ||
    process.env.BUILD_NUMBER ||
    process.env.GITHUB_RUN_NUMBER ||
    process.env.CI_PIPELINE_IID ||
    gitCommitCount ||
    'dev';

const gitSha = process.env.PUBLIC_GIT_SHA || process.env.COMMIT_REF || process.env.GITHUB_SHA || gitShortSha || '';

// https://astro.build/config
export default defineConfig({
    vite: {
        plugins: [tailwindcss()],
        define: {
            'import.meta.env.PUBLIC_APP_VERSION': JSON.stringify(appVersion),
            'import.meta.env.PUBLIC_BUILD_NUMBER': JSON.stringify(String(buildNumber)),
            'import.meta.env.PUBLIC_BUILD_DATE': JSON.stringify(buildDate),
            'import.meta.env.PUBLIC_GIT_SHA': JSON.stringify(gitSha)
        }
    },
    integrations: [react()],
    adapter: netlify()
});
