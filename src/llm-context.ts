import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchemaProperty } from './tools.js';

/** Public MCP base; paths under it may include an API key segment — never echo secrets in docs. */
const BITREFILL_MCP_PUBLIC_BASE = 'https://api.bitrefill.com/mcp';

export interface GenerateLlmContextOptions {
    /** MCP server URL used for this session (shown in the header; API key segment is redacted). */
    mcpUrl?: string;
    /** CLI program name (default `bitrefill`). */
    programName?: string;
}

function sanitizeMcpUrlForDocs(url: string): string {
    if (url === BITREFILL_MCP_PUBLIC_BASE) return url;
    if (url.startsWith(`${BITREFILL_MCP_PUBLIC_BASE}/`)) {
        return `${BITREFILL_MCP_PUBLIC_BASE}/<API_KEY>`;
    }
    return url;
}

function sortedPropertyEntries(tool: Tool): [string, JsonSchemaProperty][] {
    const schema = tool.inputSchema as {
        properties?: Record<string, JsonSchemaProperty>;
    };
    if (!schema.properties) return [];
    return Object.entries(schema.properties).sort(([a], [b]) =>
        a.localeCompare(b)
    );
}

/** JSON.stringify for use as a shell argument (bash/zsh). */
function shellArgFromString(value: string): string {
    return JSON.stringify(value);
}

function exampleArgumentValue(prop: JsonSchemaProperty): string {
    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
        const first = prop.enum[0];
        return typeof first === 'string'
            ? shellArgFromString(first)
            : String(first);
    }
    const t = prop.type;
    switch (t) {
        case 'number':
        case 'integer':
            return '1';
        case 'boolean':
            return 'true';
        case 'array':
            return `'[]'`;
        case 'object':
            return `'{}'`;
        case 'string':
        default:
            return shellArgFromString('example');
    }
}

function buildCliExample(
    tool: Tool,
    programName: string,
    entries: [string, JsonSchemaProperty][]
): string {
    if (entries.length === 0) return `${programName} ${tool.name}`;

    const schema = tool.inputSchema as { required?: string[] };
    const required = new Set(schema.required ?? []);

    const parts: string[] = [`${programName} ${tool.name}`];
    for (const [name, prop] of entries) {
        if (!required.has(name)) continue;
        parts.push(`--${name} ${exampleArgumentValue(prop)}`);
    }
    for (const [name, prop] of entries) {
        if (required.has(name)) continue;
        parts.push(`--${name} ${exampleArgumentValue(prop)}`);
        break;
    }
    return parts.join(' ');
}

function buildMcpToolsCallExample(
    tool: Tool,
    entries: [string, JsonSchemaProperty][]
): string {
    const args: Record<string, unknown> = {};
    const schema = tool.inputSchema as { required?: string[] };
    const required = new Set(schema.required ?? []);

    for (const [name, prop] of entries) {
        if (!required.has(name)) continue;
        args[name] = exampleJsonValue(prop);
    }
    if (Object.keys(args).length === 0 && entries.length > 0) {
        const [name, prop] = entries[0];
        args[name] = exampleJsonValue(prop);
    }

    return JSON.stringify(
        {
            method: 'tools/call',
            params: {
                name: tool.name,
                arguments: args,
            },
        },
        null,
        2
    );
}

function exampleJsonValue(prop: JsonSchemaProperty): unknown {
    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
        return prop.enum[0];
    }
    const t = prop.type;
    switch (t) {
        case 'number':
        case 'integer':
            return 1;
        case 'boolean':
            return true;
        case 'array':
            return [];
        case 'object':
            return {};
        case 'string':
        default:
            return 'example';
    }
}

function formatParameterTable(
    tool: Tool,
    entries: [string, JsonSchemaProperty][]
): string {
    if (entries.length === 0) {
        return '_No parameters._\n';
    }

    const schema = tool.inputSchema as { required?: string[] };
    const required = new Set(schema.required ?? []);

    const rows = entries.map(([name, prop]) => {
        const req = required.has(name) ? 'yes' : 'no';
        const ty = prop.type ?? '—';
        const desc = (prop.description ?? '—').replace(/\|/g, '\\|');
        return `| \`${name}\` | ${ty} | ${req} | ${desc} |`;
    });

    return [
        '| Name | Type | Required | Description |',
        '| --- | --- | --- | --- |',
        ...rows,
        '',
    ].join('\n');
}

/**
 * Markdown describing MCP tools (from `tools/list`): names, descriptions,
 * parameter tables, JSON Schema, CLI examples, and `tools/call` JSON.
 */
export function generateLlmContextMarkdown(
    tools: Tool[],
    options?: GenerateLlmContextOptions
): string {
    const programName = options?.programName ?? 'bitrefill';
    const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));

    const lines: string[] = [
        '# Bitrefill MCP — LLM context',
        '',
        'Generated by `' +
            programName +
            ' llm-context`. Add this to **CLAUDE.md**, **Cursor rules**, or **`.github/copilot-instructions.md`** so agents know how to use the Bitrefill API via MCP or this CLI.',
        '',
    ];

    if (options?.mcpUrl) {
        lines.push('## Connection');
        lines.push('');
        lines.push(
            `- MCP URL used for this run: \`${sanitizeMcpUrlForDocs(options.mcpUrl)}\` (override with \`MCP_URL\` or \`--api-key\` / \`BITREFILL_API_KEY\`).`
        );
        lines.push('');
    }

    lines.push('## Tools');
    lines.push('');

    for (const tool of sorted) {
        const entries = sortedPropertyEntries(tool);
        lines.push(`### \`${tool.name}\``);
        lines.push('');
        lines.push(tool.description?.trim() || '_No description._');
        lines.push('');
        lines.push('#### Parameters');
        lines.push('');
        lines.push(formatParameterTable(tool, entries));
        lines.push('#### Input schema (JSON Schema)');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(tool.inputSchema ?? {}, null, 2));
        lines.push('```');
        lines.push('');

        if (tool.outputSchema) {
            lines.push('#### Output schema (JSON Schema)');
            lines.push('');
            lines.push('```json');
            lines.push(JSON.stringify(tool.outputSchema, null, 2));
            lines.push('```');
            lines.push('');
        }

        lines.push('#### Example: CLI');
        lines.push('');
        lines.push('```bash');
        lines.push(buildCliExample(tool, programName, entries));
        lines.push('```');
        lines.push('');
        lines.push('#### Example: MCP `tools/call`');
        lines.push('');
        lines.push('```json');
        lines.push(buildMcpToolsCallExample(tool, entries));
        lines.push('```');
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    return lines.join('\n');
}
