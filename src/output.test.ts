import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    parseToonToJson,
    createHumanFormatter,
    createJsonFormatter,
} from './output.js';

describe('parseToonToJson', () => {
    it('returns plain text when neither JSON nor TOON', () => {
        expect(parseToonToJson('not json')).toBe('not json');
    });
});

describe('createHumanFormatter', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('writes info to stdout', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const fmt = createHumanFormatter();
        fmt.info('hello');
        expect(log).toHaveBeenCalledWith('hello');
    });

    it('writes top-level errors to stderr', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fmt = createHumanFormatter();
        fmt.error(new Error('boom'));
        expect(err).toHaveBeenCalledWith('Error:', 'boom');
    });

    it('writes client errors to stderr with prefix', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fmt = createHumanFormatter();
        const e = new Error('sse');
        fmt.clientError(e);
        expect(err).toHaveBeenCalledWith('Client error:', e);
    });

    it('pretty-prints text tool content', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const fmt = createHumanFormatter();
        fmt.result([{ type: 'text', text: '{"a":2}' }]);
        expect(log).toHaveBeenCalledWith(JSON.stringify({ a: 2 }, null, 2));
    });

    it('logs non-text content with type label', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const fmt = createHumanFormatter();
        fmt.result([{ type: 'image', url: 'x' }]);
        expect(log).toHaveBeenCalledWith('[image]', {
            type: 'image',
            url: 'x',
        });
    });
});

describe('createJsonFormatter', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('writes info to stderr', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fmt = createJsonFormatter();
        fmt.info('status');
        expect(err).toHaveBeenCalledWith('status');
    });

    it('writes errors as JSON to stderr', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fmt = createJsonFormatter();
        fmt.error(new Error('bad'));
        expect(err).toHaveBeenCalledWith(JSON.stringify({ error: 'bad' }));
    });

    it('writes client errors as JSON to stderr', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fmt = createJsonFormatter();
        fmt.clientError(new Error('net'));
        expect(err).toHaveBeenCalledWith(JSON.stringify({ error: 'net' }));
    });

    it('writes compact JSON result to stdout', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const fmt = createJsonFormatter();
        fmt.result([{ type: 'text', text: '{"k":1}' }]);
        expect(log).toHaveBeenCalledWith(JSON.stringify({ k: 1 }));
    });

    it('outputs null for empty content', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const fmt = createJsonFormatter();
        fmt.result([]);
        expect(log).toHaveBeenCalledWith('null');
    });

    it('wraps multiple values in an array', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const fmt = createJsonFormatter();
        fmt.result([
            { type: 'text', text: '1' },
            { type: 'text', text: '2' },
        ]);
        expect(log).toHaveBeenCalledWith(JSON.stringify([1, 2]));
    });
});
