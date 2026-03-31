import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
    writeCredentials,
    readCredentials,
    deleteCredentials,
    redactKey,
} from './credentials.js';

const TEST_DIR = path.join(os.tmpdir(), `bitrefill-cli-test-${Date.now()}`);
const CREDENTIALS_DIR = path.join(os.homedir(), '.config', 'bitrefill-cli');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

describe('redactKey', () => {
    it('redacts a long key showing first 4 and last 3 chars', () => {
        expect(redactKey('br_live_abcdefghijk')).toBe('br_l...ijk');
    });

    it('fully masks keys shorter than 10 characters', () => {
        expect(redactKey('short')).toBe('***');
        expect(redactKey('123456789')).toBe('***');
    });

    it('handles exactly 10 character keys', () => {
        expect(redactKey('1234567890')).toBe('1234...890');
    });
});

describe('writeCredentials / readCredentials / deleteCredentials', () => {
    let originalFile: string | null = null;

    beforeEach(() => {
        try {
            originalFile = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
        } catch {
            originalFile = null;
        }
    });

    afterEach(() => {
        if (originalFile !== null) {
            fs.writeFileSync(CREDENTIALS_FILE, originalFile);
        } else {
            try {
                fs.unlinkSync(CREDENTIALS_FILE);
            } catch {
                /* noop */
            }
        }
    });

    it('writes and reads back the API key', () => {
        writeCredentials('test_key_1234567890');
        const key = readCredentials();
        expect(key).toBe('test_key_1234567890');
    });

    it('overwrites an existing key on re-write', () => {
        writeCredentials('first_key_xxxxxxxxx');
        writeCredentials('second_key_yyyyyyyy');
        expect(readCredentials()).toBe('second_key_yyyyyyyy');
    });

    it('returns undefined when no credential file exists', () => {
        deleteCredentials();
        expect(readCredentials()).toBeUndefined();
    });

    it('deleteCredentials removes the file', () => {
        writeCredentials('to_be_deleted_12345');
        deleteCredentials();
        expect(readCredentials()).toBeUndefined();
    });

    it('deleteCredentials is safe to call when no file exists', () => {
        deleteCredentials();
        expect(() => deleteCredentials()).not.toThrow();
    });

    it('sets restrictive file permissions (0600)', () => {
        writeCredentials('perm_test_key_12345');
        const stat = fs.statSync(CREDENTIALS_FILE);
        const mode = stat.mode & 0o777;
        expect(mode).toBe(0o600);
    });
});
