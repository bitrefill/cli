#!/usr/bin/env node

import { Command } from 'commander';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import {
    ListToolsResultSchema,
    CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
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
import {
    createHumanFormatter,
    createJsonFormatter,
    type OutputFormatter,
} from './output.js';
import { buildOptionsForTool, parseToolArgs } from './tools.js';
import { generateLlmContextMarkdown } from './llm-context.js';
import { resolveApiKeyWithStore } from './credentials.js';
import { runInit } from './init.js';
import { VERSION } from './version.js';

/** Subcommands defined by the CLI; MCP tools with the same name are skipped. */
const RESERVED_TOOL_NAMES = new Set(['logout', 'llm-context', 'init']);

const BASE_MCP_URL = 'https://api.bitrefill.com/mcp';
const CALLBACK_PORT = 8098;
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const STATE_DIR = path.join(os.homedir(), '.config', 'bitrefill-cli');

function resolveApiKey(): string | undefined {
    return resolveApiKeyWithStore();
}

function resolveMcpUrl(apiKey?: string): string {
    if (process.env.MCP_URL) return process.env.MCP_URL;
    if (apiKey) return `${BASE_MCP_URL}/${apiKey}`;
    return BASE_MCP_URL;
}

function resolveJsonMode(): boolean {
    return process.argv.some((arg) => arg === '--json');
}

function resolveInteractive(): boolean {
    if (process.argv.includes('--no-interactive')) return false;
    if (process.env.CI === 'true') return false;
    if (!process.stdin.isTTY) return false;
    return true;
}

function createOutputFormatter(jsonMode: boolean): OutputFormatter {
    return jsonMode ? createJsonFormatter() : createHumanFormatter();
}

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

function createOAuthProvider(
    serverUrl: string,
    formatter: OutputFormatter
): OAuthClientProvider {
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
            formatter.info(
                `\nOpen this URL to authorize:\n  ${url.toString()}\n`
            );
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
    url: string,
    useOAuth: boolean,
    formatter: OutputFormatter
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const suppressNoise = (err: Error) => {
        if (err instanceof UnauthorizedError) return;
        if (err.message?.includes('SSE stream disconnected')) return;
        if (err.message?.includes('Failed to open SSE stream')) return;
        formatter.clientError(err);
    };

    if (!useOAuth) {
        const c = new Client({
            name: 'bitrefill-cli',
            version: VERSION,
        });
        c.onerror = suppressNoise;
        const t = new StreamableHTTPClientTransport(new URL(url));
        await c.connect(t);
        return { client: c, transport: t };
    }

    const authProvider = createOAuthProvider(url, formatter);

    const tryConnect = async () => {
        const c = new Client({
            name: 'bitrefill-cli',
            version: VERSION,
        });
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

        formatter.info('Authorization required...');
        const code = await waitForCallback();
        formatter.info('Authorization code received.');

        const c = new Client({
            name: 'bitrefill-cli',
            version: VERSION,
        });
        c.onerror = suppressNoise;
        const t = new StreamableHTTPClientTransport(new URL(url), {
            authProvider,
        });
        await t.finishAuth(code);
        await c.connect(t);
        return { client: c, transport: t };
    }
}

// --- Init (pre-connect) ---

function isInitCommand(): boolean {
    const hasInit = process.argv.some((arg, i) => arg === 'init' && i >= 2);
    if (!hasInit) return false;
    const hasHelp =
        process.argv.includes('--help') || process.argv.includes('-h');
    return !hasHelp;
}

const INIT_HELP = `Usage: bitrefill init [options]

Set up the CLI: validate API key, store credentials, and optionally register with OpenClaw.

Options:
  --api-key <key>     Bitrefill API key
  --openclaw          Force OpenClaw integration even if not auto-detected
  --non-interactive   Disable interactive prompts
  -h, --help          Display help for command`;

async function handleInit(): Promise<void> {
    const formatter = createOutputFormatter(resolveJsonMode());

    const apiKeyIdx = process.argv.indexOf('--api-key');
    const apiKey =
        apiKeyIdx !== -1 && apiKeyIdx + 1 < process.argv.length
            ? process.argv[apiKeyIdx + 1]
            : undefined;

    try {
        await runInit({
            apiKey,
            openclaw: process.argv.includes('--openclaw'),
            nonInteractive: !resolveInteractive(),
        });
    } catch (err) {
        formatter.error(err);
        process.exit(1);
    }
}

function isInitHelpCommand(): boolean {
    const hasInit = process.argv.some((arg, i) => arg === 'init' && i >= 2);
    const hasHelp =
        process.argv.includes('--help') || process.argv.includes('-h');
    return hasInit && hasHelp;
}

// --- Main ---

async function main(): Promise<void> {
    if (isInitCommand()) {
        await handleInit();
        return;
    }

    if (isInitHelpCommand()) {
        console.log(INIT_HELP);
        return;
    }

    const apiKey = resolveApiKey();
    const formatter = createOutputFormatter(resolveJsonMode());
    const mcpUrl = resolveMcpUrl(apiKey);
    const useOAuth = !apiKey && !process.env.MCP_URL;

    if (useOAuth && !resolveInteractive()) {
        formatter.error(
            new Error(
                'Authorization required but running in non-interactive mode.\n' +
                    'Use --api-key or set BITREFILL_API_KEY to authenticate without a browser.\n' +
                    'Or run: bitrefill init'
            )
        );
        process.exit(1);
    }

    // Phase 1: connect and discover tools
    const { client, transport } = await createMcpClient(
        mcpUrl,
        useOAuth,
        formatter
    );

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
        .version(VERSION)
        .option(
            '--api-key <key>',
            'Bitrefill API key (overrides BITREFILL_API_KEY env var)'
        )
        .option(
            '--json',
            'Output raw JSON (TOON decoded); use with jq. Non-result messages go to stderr.'
        )
        .option(
            '--no-interactive',
            'Disable browser-based auth and interactive prompts (auto-detected in CI / non-TTY)'
        );

    program
        .command('init')
        .description(
            'Set up the CLI: validate API key, store credentials, and optionally register with OpenClaw'
        )
        .option(
            '--openclaw',
            'Force OpenClaw integration even if not auto-detected'
        )
        .action(() => {
            formatter.info('init has already been handled.');
        });

    program
        .command('logout')
        .description('Clear stored OAuth credentials')
        .action(() => {
            if (!useOAuth) {
                formatter.info(
                    'Using API key authentication — no stored credentials to clear.'
                );
                return;
            }
            try {
                fs.unlinkSync(stateFilePath(mcpUrl));
                formatter.info('Cleared stored credentials.');
            } catch {
                formatter.info('No stored credentials to clear.');
            }
        });

    program
        .command('llm-context')
        .description(
            'Emit MCP tools reference as Markdown (for CLAUDE.md, Cursor rules, Copilot instructions)'
        )
        .option(
            '-o, --output <file>',
            'Write Markdown to a file instead of stdout'
        )
        .action((opts: { output?: string }) => {
            const md = generateLlmContextMarkdown(tools, {
                mcpUrl,
                programName: program.name(),
            });
            if (opts.output) {
                fs.writeFileSync(opts.output, md, 'utf-8');
            } else {
                process.stdout.write(md);
            }
        });

    // Register each MCP tool as a subcommand
    for (const tool of tools) {
        if (RESERVED_TOOL_NAMES.has(tool.name)) continue;
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
            formatter.result(result.content ?? []);
        });
    }

    // Phase 3: parse argv and execute
    program.hook('postAction', async () => {
        await transport.close();
    });

    await program.parseAsync(process.argv);
}

main().catch((err) => {
    const formatter = createOutputFormatter(resolveJsonMode());
    formatter.error(err);
    process.exit(1);
});
