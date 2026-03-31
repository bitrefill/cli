import { describe, it, expect } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { generateLlmContextMarkdown } from './llm-context.js';

describe('generateLlmContextMarkdown', () => {
    it('includes tool name, description, schema, CLI and MCP examples', () => {
        const tools: Tool[] = [
            {
                name: 'search_products',
                description: 'Search catalog.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query',
                        },
                        limit: {
                            type: 'integer',
                            description: 'Max results',
                        },
                    },
                    required: ['query'],
                },
            },
        ];

        const md = generateLlmContextMarkdown(tools, {
            mcpUrl: 'https://api.bitrefill.com/mcp/test',
            programName: 'bitrefill',
        });

        expect(md).toContain('# Bitrefill MCP — LLM context');
        expect(md).toContain('## Connection');
        expect(md).toContain('https://api.bitrefill.com/mcp/<API_KEY>');
        expect(md).toContain('### `search_products`');
        expect(md).toContain('Search catalog.');
        expect(md).toContain('| `query` |');
        expect(md).toContain('#### Input schema (JSON Schema)');
        expect(md).toContain('"type": "object"');
        expect(md).toContain('#### Example: CLI');
        expect(md).toContain('bitrefill search_products');
        expect(md).toContain('--query');
        expect(md).toContain('#### Example: MCP `tools/call`');
        expect(md).toContain('"method": "tools/call"');
        expect(md).toContain('"name": "search_products"');
    });

    it('sorts tools by name', () => {
        const tools: Tool[] = [
            {
                name: 'zebra',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'alpha',
                inputSchema: { type: 'object', properties: {} },
            },
        ];

        const md = generateLlmContextMarkdown(tools);
        expect(md.indexOf('`alpha`')).toBeLessThan(md.indexOf('`zebra`'));
    });

    it('includes output schema when present', () => {
        const tools: Tool[] = [
            {
                name: 't',
                inputSchema: { type: 'object', properties: {} },
                outputSchema: {
                    type: 'object',
                    properties: { ok: { type: 'boolean' } },
                },
            },
        ];

        const md = generateLlmContextMarkdown(tools);
        expect(md).toContain('#### Output schema (JSON Schema)');
        expect(md).toContain('"ok"');
    });
});
