import { Command } from 'commander';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface JsonSchemaProperty {
    type?: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
}

export function coerceValue(raw: string, prop: JsonSchemaProperty): unknown {
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
        case 'object':
        case 'array':
            return JSON.parse(raw);
        default:
            return raw;
    }
}

export function buildOptionsForTool(cmd: Command, tool: Tool): void {
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

export function parseToolArgs(
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

export function optionKey(s: string): string {
    return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
