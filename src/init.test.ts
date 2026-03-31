import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectOpenClaw } from './init.js';

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');

describe('detectOpenClaw', () => {
    it('returns true when --openclaw flag is set', () => {
        expect(detectOpenClaw(true)).toBe(true);
    });

    it('returns true when ~/.openclaw/openclaw.json exists', () => {
        const exists = fs.existsSync(OPENCLAW_CONFIG);
        if (exists) {
            expect(detectOpenClaw(false)).toBe(true);
        }
    });

    it('returns false when config does not exist and flag is false', () => {
        const spy = vi.spyOn(fs, 'accessSync').mockImplementation(() => {
            throw new Error('ENOENT');
        });
        expect(detectOpenClaw(false)).toBe(false);
        spy.mockRestore();
    });
});

describe('OpenClaw .env merge', () => {
    const testDir = path.join(os.tmpdir(), `bitrefill-oc-test-${Date.now()}`);
    const testEnvFile = path.join(testDir, '.env');

    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('appends BITREFILL_API_KEY to an empty file', () => {
        fs.writeFileSync(testEnvFile, '', 'utf-8');

        const varLine = 'BITREFILL_API_KEY=test_key_123';
        let content = fs.readFileSync(testEnvFile, 'utf-8');
        const lines = content.split('\n');
        lines.push(varLine);
        fs.writeFileSync(testEnvFile, lines.join('\n'), 'utf-8');

        const result = fs.readFileSync(testEnvFile, 'utf-8');
        expect(result).toContain('BITREFILL_API_KEY=test_key_123');
    });

    it('replaces existing BITREFILL_API_KEY line', () => {
        fs.writeFileSync(
            testEnvFile,
            'OTHER_VAR=foo\nBITREFILL_API_KEY=old_key\nANOTHER=bar\n',
            'utf-8'
        );

        let content = fs.readFileSync(testEnvFile, 'utf-8');
        const lines = content.split('\n');
        const idx = lines.findIndex((l: string) =>
            l.startsWith('BITREFILL_API_KEY=')
        );
        if (idx !== -1) {
            lines[idx] = 'BITREFILL_API_KEY=new_key_456';
        }
        fs.writeFileSync(testEnvFile, lines.join('\n'), 'utf-8');

        const result = fs.readFileSync(testEnvFile, 'utf-8');
        expect(result).toContain('BITREFILL_API_KEY=new_key_456');
        expect(result).not.toContain('old_key');
        expect(result).toContain('OTHER_VAR=foo');
        expect(result).toContain('ANOTHER=bar');
    });
});

describe('OpenClaw config merge', () => {
    const testDir = path.join(
        os.tmpdir(),
        `bitrefill-oc-config-test-${Date.now()}`
    );
    const testConfig = path.join(testDir, 'openclaw.json');

    beforeEach(() => {
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('creates mcp.servers.bitrefill with env-var reference URL', () => {
        const config = { gateway: { port: 3000 } };
        fs.writeFileSync(testConfig, JSON.stringify(config), 'utf-8');

        const parsed = JSON.parse(
            fs.readFileSync(testConfig, 'utf-8')
        ) as Record<string, unknown>;
        const mcp = (parsed.mcp ?? {}) as Record<string, unknown>;
        const servers = (mcp.servers ?? {}) as Record<string, unknown>;
        servers['bitrefill'] = {
            url: 'https://api.bitrefill.com/mcp/${BITREFILL_API_KEY}',
            name: 'Bitrefill',
            description: 'Gift cards, mobile top-ups, and eSIMs',
        };
        parsed.mcp = { ...mcp, servers };
        fs.writeFileSync(testConfig, JSON.stringify(parsed, null, 2), 'utf-8');

        const result = JSON.parse(
            fs.readFileSync(testConfig, 'utf-8')
        ) as Record<string, unknown>;

        expect(result.gateway).toEqual({ port: 3000 });

        const resultMcp = result.mcp as Record<string, unknown>;
        const resultServers = resultMcp.servers as Record<string, unknown>;
        const bitrefill = resultServers.bitrefill as Record<string, string>;

        expect(bitrefill.url).toBe(
            'https://api.bitrefill.com/mcp/${BITREFILL_API_KEY}'
        );
        expect(bitrefill.url).not.toMatch(/br_live_|br_test_/);
        expect(bitrefill.name).toBe('Bitrefill');
    });

    it('preserves existing MCP servers when adding bitrefill', () => {
        const config = {
            mcp: {
                servers: {
                    'other-tool': {
                        command: '/usr/bin/other',
                        args: ['serve'],
                    },
                },
            },
        };
        fs.writeFileSync(testConfig, JSON.stringify(config), 'utf-8');

        const parsed = JSON.parse(
            fs.readFileSync(testConfig, 'utf-8')
        ) as Record<string, unknown>;
        const mcp = parsed.mcp as Record<string, unknown>;
        const servers = mcp.servers as Record<string, unknown>;
        servers['bitrefill'] = {
            url: 'https://api.bitrefill.com/mcp/${BITREFILL_API_KEY}',
            name: 'Bitrefill',
            description: 'Gift cards, mobile top-ups, and eSIMs',
        };
        fs.writeFileSync(testConfig, JSON.stringify(parsed, null, 2), 'utf-8');

        const result = JSON.parse(
            fs.readFileSync(testConfig, 'utf-8')
        ) as Record<string, unknown>;
        const resultMcp = result.mcp as Record<string, unknown>;
        const resultServers = resultMcp.servers as Record<string, unknown>;

        expect(resultServers['other-tool']).toEqual({
            command: '/usr/bin/other',
            args: ['serve'],
        });
        expect(resultServers['bitrefill']).toBeDefined();
    });
});
