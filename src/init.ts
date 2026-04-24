import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { writeCredentials, redactKey } from './credentials.js';
import { generateLlmContextMarkdown } from './llm-context.js';
import { VERSION } from './version.js';

const BASE_MCP_URL = 'https://api.bitrefill.com/mcp';
const DEVELOPER_PORTAL_URL = 'https://www.bitrefill.com/account/developers';

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');
const OPENCLAW_ENV = path.join(OPENCLAW_DIR, '.env');
const OPENCLAW_SKILL_DIR = path.join(OPENCLAW_DIR, 'skills', 'bitrefill');
const OPENCLAW_SKILL_FILE = path.join(OPENCLAW_SKILL_DIR, 'SKILL.md');

export interface InitOptions {
    apiKey?: string;
    openclaw?: boolean;
    nonInteractive?: boolean;
}

export interface InitResult {
    apiKey: string;
    toolCount: number;
    openclawConfigured: boolean;
    skillPath?: string;
}

// --- Key input ---

async function promptForApiKey(): Promise<string> {
    process.stderr.write(`\nGet your API key at: ${DEVELOPER_PORTAL_URL}\n\n`);

    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stderr,
        });

        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        let input = '';
        process.stderr.write('API key: ');

        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf-8');

            const onData = (ch: string) => {
                const c = ch.toString();
                if (c === '\n' || c === '\r') {
                    process.stdin.setRawMode(false);
                    process.stdin.removeListener('data', onData);
                    process.stdin.pause();
                    rl.close();
                    process.stderr.write('\n');
                    const trimmed = input.trim();
                    if (!trimmed) {
                        reject(new Error('No API key provided.'));
                    } else {
                        resolve(trimmed);
                    }
                } else if (c === '\u0003') {
                    process.stdin.setRawMode(false);
                    rl.close();
                    reject(new Error('Aborted.'));
                } else if (c === '\u007f' || c === '\b') {
                    if (input.length > 0) {
                        input = input.slice(0, -1);
                        process.stderr.write('\b \b');
                    }
                } else {
                    input += c;
                    process.stderr.write('*');
                }
            };

            process.stdin.on('data', onData);
        } else {
            rl.question('', (answer) => {
                rl.close();
                const trimmed = answer.trim();
                if (!trimmed) {
                    reject(new Error('No API key provided.'));
                } else {
                    resolve(trimmed);
                }
            });
        }
    });
}

function resolveInitApiKey(opts: InitOptions): string | undefined {
    return opts.apiKey || process.env.BITREFILL_API_KEY || undefined;
}

// --- MCP validation ---

async function validateApiKey(apiKey: string): Promise<{ tools: Tool[] }> {
    const url = `${BASE_MCP_URL}/${apiKey}`;
    const client = new Client({
        name: 'bitrefill-cli',
        version: VERSION,
    });
    const transport = new StreamableHTTPClientTransport(new URL(url));

    try {
        await client.connect(transport);
        const result = await client.request(
            { method: 'tools/list', params: {} },
            ListToolsResultSchema
        );
        return { tools: result.tools };
    } finally {
        try {
            await transport.close();
        } catch {
            /* best-effort cleanup */
        }
    }
}

// --- OpenClaw detection ---

export function detectOpenClaw(forceFlag: boolean): boolean {
    if (forceFlag) return true;
    try {
        fs.accessSync(OPENCLAW_CONFIG, fs.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

// --- OpenClaw .env ---

function writeOpenClawEnv(apiKey: string): void {
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });

    const varLine = `BITREFILL_API_KEY=${apiKey}`;
    let content = '';

    try {
        content = fs.readFileSync(OPENCLAW_ENV, 'utf-8');
    } catch {
        /* file may not exist */
    }

    const lines = content.split('\n');
    const idx = lines.findIndex((l) => l.startsWith('BITREFILL_API_KEY='));

    if (idx !== -1) {
        lines[idx] = varLine;
    } else {
        if (content.length > 0 && !content.endsWith('\n')) {
            lines.push('');
        }
        lines.push(varLine);
    }

    const result = lines.join('\n').replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(OPENCLAW_ENV, result, { mode: 0o600 });
}

// --- OpenClaw config merge ---

interface OpenClawConfig {
    mcp?: {
        servers?: Record<string, unknown>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

function mergeOpenClawConfig(): void {
    let config: OpenClawConfig = {};

    try {
        config = JSON.parse(
            fs.readFileSync(OPENCLAW_CONFIG, 'utf-8')
        ) as OpenClawConfig;
    } catch {
        /* start fresh if missing or malformed */
    }

    if (!config.mcp) config.mcp = {};
    if (!config.mcp.servers) config.mcp.servers = {};

    config.mcp.servers['bitrefill'] = {
        url: `${BASE_MCP_URL}/\${BITREFILL_API_KEY}`,
        name: 'Bitrefill',
        description: 'Gift cards, mobile top-ups, and eSIMs',
    };

    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
    fs.writeFileSync(
        OPENCLAW_CONFIG,
        JSON.stringify(config, null, 2) + '\n',
        'utf-8'
    );
}

// --- SKILL.md ---

function writeSkillFile(tools: Tool[], mcpUrl: string): string {
    fs.mkdirSync(OPENCLAW_SKILL_DIR, { recursive: true });

    const md = generateLlmContextMarkdown(tools, {
        mcpUrl,
        programName: 'bitrefill',
    });
    fs.writeFileSync(OPENCLAW_SKILL_FILE, md, 'utf-8');
    return OPENCLAW_SKILL_FILE;
}

// --- Orchestrator ---

export async function runInit(opts: InitOptions): Promise<InitResult> {
    let apiKey = resolveInitApiKey(opts);

    if (!apiKey) {
        if (opts.nonInteractive) {
            throw new Error(
                'No API key provided.\n' +
                    'Pass --api-key <key> or set BITREFILL_API_KEY.\n' +
                    `Get a key at: ${DEVELOPER_PORTAL_URL}`
            );
        }
        apiKey = await promptForApiKey();
    }

    process.stderr.write('Validating API key...\n');

    let tools: Tool[];
    try {
        const result = await validateApiKey(apiKey);
        tools = result.tools;
    } catch {
        throw new Error(
            `Invalid API key or connection failed.\nGet a key at: ${DEVELOPER_PORTAL_URL}`
        );
    }

    writeCredentials(apiKey);

    const openclawDetected = detectOpenClaw(opts.openclaw ?? false);
    let skillPath: string | undefined;

    if (openclawDetected) {
        writeOpenClawEnv(apiKey);
        mergeOpenClawConfig();
        skillPath = writeSkillFile(tools, BASE_MCP_URL);
    }

    const summary = [
        '',
        'Bitrefill initialized.',
        '',
        `  Key:        ${redactKey(apiKey)}  (stored in ~/.config/bitrefill-cli/)`,
        `  Tools:      ${tools.length} available`,
    ];

    if (openclawDetected) {
        summary.push(
            '  OpenClaw:   registered (env-var ref, no plaintext key in config)'
        );
        summary.push(`  SKILL.md:   ${skillPath}`);
    }

    summary.push('');
    summary.push('Try it:');

    if (openclawDetected) {
        summary.push(
            '  Telegram:  "Search for Netflix gift cards on Bitrefill"'
        );
    }

    summary.push('  CLI:       bitrefill search-products --query "Netflix"');
    summary.push('');

    process.stderr.write(summary.join('\n'));

    return {
        apiKey,
        toolCount: tools.length,
        openclawConfigured: openclawDetected,
        skillPath,
    };
}
