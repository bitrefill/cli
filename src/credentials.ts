import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CREDENTIALS_DIR = path.join(os.homedir(), '.config', 'bitrefill-cli');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

interface StoredCredentials {
    apiKey: string;
}

export function writeCredentials(apiKey: string): void {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
    const data: StoredCredentials = { apiKey };
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2) + '\n', {
        mode: 0o600,
    });
    fs.chmodSync(CREDENTIALS_FILE, 0o600);
}

export function readCredentials(): string | undefined {
    try {
        const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
        const data = JSON.parse(raw) as StoredCredentials;
        return data.apiKey || undefined;
    } catch {
        return undefined;
    }
}

export function deleteCredentials(): void {
    try {
        fs.unlinkSync(CREDENTIALS_FILE);
    } catch {
        /* file may not exist */
    }
}

/**
 * Redact an API key for display: show the first 4 and last 3 characters.
 * Keys shorter than 10 chars are fully masked.
 */
export function redactKey(key: string): string {
    if (key.length < 10) return '***';
    return `${key.slice(0, 4)}...${key.slice(-3)}`;
}

/**
 * Resolve the API key from all available sources, in priority order:
 * 1. `--api-key` CLI flag
 * 2. `BITREFILL_API_KEY` environment variable
 * 3. Stored credential file (~/.config/bitrefill-cli/credentials.json)
 */
export function resolveApiKeyWithStore(): string | undefined {
    const idx = process.argv.indexOf('--api-key');
    if (idx !== -1 && idx + 1 < process.argv.length) {
        return process.argv[idx + 1];
    }
    if (process.env.BITREFILL_API_KEY) {
        return process.env.BITREFILL_API_KEY;
    }
    return readCredentials();
}
