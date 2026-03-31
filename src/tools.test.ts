import { describe, it, expect } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { coerceValue, optionKey, parseToolArgs } from './tools.js';

describe('optionKey', () => {
    it('converts kebab-case flag names to camelCase keys', () => {
        expect(optionKey('foo-bar')).toBe('fooBar');
        expect(optionKey('a-b-c')).toBe('aBC');
    });
});

describe('coerceValue', () => {
    it('coerces numbers and integers', () => {
        expect(coerceValue('42', { type: 'number' })).toBe(42);
        expect(coerceValue('3', { type: 'integer' })).toBe(3);
    });

    it('rejects invalid numbers', () => {
        expect(() => coerceValue('x', { type: 'number' })).toThrow(
            'Must be a number'
        );
    });

    it('coerces booleans', () => {
        expect(coerceValue('true', { type: 'boolean' })).toBe(true);
        expect(coerceValue('0', { type: 'boolean' })).toBe(false);
    });

    it('rejects invalid booleans', () => {
        expect(() => coerceValue('maybe', { type: 'boolean' })).toThrow(
            'Must be true/false'
        );
    });

    it('validates enum values', () => {
        expect(coerceValue('a', { enum: ['a', 'b'] })).toBe('a');
        expect(() => coerceValue('c', { enum: ['a', 'b'] })).toThrow(
            'Must be one of: a, b'
        );
    });

    it('returns raw string for default schema', () => {
        expect(coerceValue('hello', {})).toBe('hello');
    });
});

describe('parseToolArgs', () => {
    const tool: Tool = {
        name: 't',
        inputSchema: {
            type: 'object',
            properties: {
                count: { type: 'integer' },
                label: { type: 'string' },
            },
        },
    };

    it('maps commander opts (camelCase) to tool argument names', () => {
        const args = parseToolArgs(
            { count: '5', label: 'hi' } as Record<string, string | undefined>,
            tool
        );
        expect(args).toEqual({ count: 5, label: 'hi' });
    });

    it('omits undefined options', () => {
        const args = parseToolArgs({ count: '1' }, tool);
        expect(args).toEqual({ count: 1 });
    });

    it('returns empty object when tool has no properties', () => {
        const noProps: Tool = {
            name: 't',
            inputSchema: { type: 'object' },
        };
        expect(parseToolArgs({ a: '1' }, noProps)).toEqual({});
    });
});
