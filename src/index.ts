#!/usr/bin/env node

import { Command } from 'commander';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import {
    ListToolsResultSchema,
    CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type {
    OAuthClientProvider,
    OAuthDiscoveryState,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type {
    OAuthClientMetadata,
    OAuthClientInformationMixed,
    OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const DEFAULT_MCP_URL = process.env.MCP_URL || 'https://api.bitrefill.com/mcp';
const CALLBACK_PORT = 8098;
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const STATE_DIR = path.join(os.homedir(), '.config', 'bitrefill-cli');

// --- Persistent OAuth state ---

interface PersistedState {
    clientInfo?: OAuthClientInformationMixed;
    tokens?: OAuthTokens;
    codeVerifier?: string;
    discoveryState?: OAuthDiscoveryState;
}

function stateFilePath(serverUrl: string): string {
    const host = new URL(serverUrl).host.replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(STATE_DIR, `${host}.json`);
}

function loadState(serverUrl: string): PersistedState {
    try {
        return JSON.parse(
            fs.readFileSync(stateFilePath(serverUrl), 'utf-8')
        ) as PersistedState;
    } catch {
        return {};
    }
}

function saveState(serverUrl: string, state: PersistedState): void {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(stateFilePath(serverUrl), JSON.stringify(state, null, 2));
}

// --- OAuth ---

function createOAuthProvider(serverUrl: string): OAuthClientProvider {
    let state = loadState(serverUrl);
    const persist = () => saveState(serverUrl, state);

    return {
        get redirectUrl() {
            return CALLBACK_URL;
        },
        get clientMetadata(): OAuthClientMetadata {
            return {
                client_name: 'Bitrefill CLI',
                redirect_uris: [CALLBACK_URL],
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'client_secret_post',
            };
        },
        clientInformation() {
            return state.clientInfo;
        },
        saveClientInformation(info: OAuthClientInformationMixed) {
            state.clientInfo = info;
            persist();
        },
        tokens() {
            return state.tokens;
        },
        saveTokens(t: OAuthTokens) {
            state.tokens = t;
            persist();
        },
        redirectToAuthorization(url: URL) {
            console.log(`\nOpen this URL to authorize:\n  ${url.toString()}\n`);
            openBrowser(url.toString());
        },
        saveCodeVerifier(v: string) {
            state.codeVerifier = v;
            persist();
        },
        codeVerifier() {
            if (!state.codeVerifier) throw new Error('No code verifier saved');
            return state.codeVerifier;
        },
        discoveryState() {
            return state.discoveryState;
        },
        saveDiscoveryState(ds: OAuthDiscoveryState) {
            state.discoveryState = ds;
            persist();
        },
        invalidateCredentials(
            scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'
        ) {
            if (scope === 'all') state = {};
            else if (scope === 'tokens') delete state.tokens;
            else if (scope === 'client') delete state.clientInfo;
            else if (scope === 'verifier') delete state.codeVerifier;
            else if (scope === 'discovery') delete state.discoveryState;
            persist();
        },
    };
}

function openBrowser(url: string): void {
    try {
        const p = process.platform;
        if (p === 'darwin') execSync(`open "${url}"`);
        else if (p === 'win32') execSync(`start "" "${url}"`);
        else execSync(`xdg-open "${url}"`);
    } catch {
        /* best-effort */
    }
}

function waitForCallback(): Promise<string> {
    return new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            if (!req.url?.startsWith('/callback')) {
                res.writeHead(404);
                res.end();
                return;
            }
            const parsed = new URL(
                req.url,
                `http://127.0.0.1:${CALLBACK_PORT}`
            );
            const code = parsed.searchParams.get('code');
            const error = parsed.searchParams.get('error');
            if (code) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(
                    '<html><body><h1>Authorized</h1><p>You can close this tab.</p><script>setTimeout(()=>window.close(),1500)</script></body></html>'
                );
                resolve(code);
            } else {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(
                    `<html><body><h1>Failed</h1><p>${error ?? 'Unknown'}</p></body></html>`
                );
                reject(new Error(`OAuth error: ${error}`));
            }
            setTimeout(() => server.close(), 2000);
        });
        server.listen(CALLBACK_PORT, '127.0.0.1');
        server.on('error', reject);
    });
}

// --- MCP connection ---

async function createMcpClient(
    url: string
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const authProvider = createOAuthProvider(url);

    const suppressNoise = (err: Error) => {
        if (err instanceof UnauthorizedError) return;
        if (err.message?.includes('SSE stream disconnected')) return;
        console.error('Client error:', err);
    };

    const tryConnect = async () => {
        const c = new Client({ name: 'bitrefill-cli', version: '0.0.1' });
        c.onerror = suppressNoise;
        const t = new StreamableHTTPClientTransport(new URL(url), {
            authProvider,
        });
        await c.connect(t);
        return { client: c, transport: t };
    };

    try {
        return await tryConnect();
    } catch (err) {
        if (!(err instanceof UnauthorizedError)) throw err;

        console.log('Authorization required...');
        const code = await waitForCallback();
        console.log('Authorization code received.');

        const c = new Client({ name: 'bitrefill-cli', version: '0.0.1' });
        c.onerror = suppressNoise;
        const t = new StreamableHTTPClientTransport(new URL(url), {
            authProvider,
        });
        await t.finishAuth(code);
        await c.connect(t);
        return { client: c, transport: t };
    }
}

// --- Tool execution ---

function printResult(result: {
    content: Array<{ type: string; text?: string; [key: string]: unknown }>;
}): void {
    for (const item of result.content) {
        if (item.type === 'text' && item.text) {
            try {
                console.log(JSON.stringify(JSON.parse(item.text), null, 2));
            } catch {
                console.log(item.text);
            }
        } else {
            console.log(`[${item.type}]`, item);
        }
    }
}

interface JsonSchemaProperty {
    type?: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
}

function coerceValue(raw: string, prop: JsonSchemaProperty): unknown {
    if (prop.enum) {
        if (!prop.enum.includes(raw))
            throw new Error(`Must be one of: ${prop.enum.join(', ')}`);
        return raw;
    }
    switch (prop.type) {
        case 'number':
        case 'integer': {
            const n = Number(raw);
            if (Number.isNaN(n)) throw new Error('Must be a number');
            return n;
        }
        case 'boolean':
            if (['true', '1', 'yes'].includes(raw)) return true;
            if (['false', '0', 'no'].includes(raw)) return false;
            throw new Error('Must be true/false');
        default:
            return JSON.parse(raw);
    }
}

function buildOptionsForTool(cmd: Command, tool: Tool): void {
    const schema = tool.inputSchema as {
        properties?: Record<string, JsonSchemaProperty>;
        required?: string[];
    };

    if (!schema.properties) return;

    const required = new Set(schema.required ?? []);

    for (const [name, prop] of Object.entries(schema.properties)) {
        const flag = `--${name} <value>`;
        let desc = prop.description ?? '';
        if (prop.enum) desc += ` (${prop.enum.join(', ')})`;

        if (prop.default !== undefined) {
            cmd.option(flag, desc, String(prop.default));
        } else if (required.has(name)) {
            cmd.requiredOption(flag, desc);
        } else {
            cmd.option(flag, desc);
        }
    }
}

function parseToolArgs(
    opts: Record<string, string | undefined>,
    tool: Tool
): Record<string, unknown> {
    const schema = tool.inputSchema as {
        properties?: Record<string, JsonSchemaProperty>;
    };
    if (!schema.properties) return {};

    const args: Record<string, unknown> = {};
    for (const [name, prop] of Object.entries(schema.properties)) {
        const raw = opts[optionKey(name)];
        if (raw === undefined) continue;
        args[name] = coerceValue(raw, prop);
    }
    return args;
}

function optionKey(s: string): string {
    return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

// --- Main ---

async function main(): Promise<void> {
    // Phase 1: connect and discover tools
    const { client, transport } = await createMcpClient(DEFAULT_MCP_URL);

    const toolsResult = await client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema
    );
    const tools = toolsResult.tools;

    // Phase 2: build CLI from discovered tools
    const program = new Command()
        .name('bitrefill')
        .description(
            'Bitrefill CLI - browse, buy, and manage gift cards, mobile top-ups, and eSIMs.\n\nTerms: https://www.bitrefill.com/terms\nPrivacy: https://www.bitrefill.com/privacy'
        )
        .version('0.0.1');

    program
        .command('logout')
        .description('Clear stored OAuth credentials')
        .action(() => {
            try {
                fs.unlinkSync(stateFilePath(DEFAULT_MCP_URL));
                console.log('Cleared stored credentials.');
            } catch {
                console.log('No stored credentials to clear.');
            }
        });

    // Register each MCP tool as a subcommand
    for (const tool of tools) {
        const sub = program
            .command(tool.name)
            .description(tool.description ?? '');

        buildOptionsForTool(sub, tool);

        sub.action(async (opts: Record<string, string | undefined>) => {
            const args = parseToolArgs(opts, tool);
            const result = await client.request(
                {
                    method: 'tools/call',
                    params: { name: tool.name, arguments: args },
                },
                CallToolResultSchema
            );
            printResult(result);
        });
    }

    // Phase 3: parse argv and execute
    program.hook('postAction', async () => {
        await transport.close();
    });

    await program.parseAsync(process.argv);
}

main().catch((err) => {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
});
