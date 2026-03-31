import { decode as decodeToon } from '@toon-format/toon';

export type ToolResultContentItem = {
    type: string;
    text?: string;
    [key: string]: unknown;
};

export interface OutputFormatter {
    /** Status / info: stdout in human mode, stderr in JSON mode so stdout stays pure JSON. */
    info(message: string): void;
    /** Top-level fatal error (e.g. main catch). */
    error(error: unknown): void;
    /** MCP transport client error (suppressed noise still logs here). */
    clientError(err: Error): void;
    /** Tool call result payload. */
    result(content: ToolResultContentItem[]): void;
}

export function parseToonToJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        try {
            return decodeToon(text);
        } catch {
            return text;
        }
    }
}

function formatResultPayload(content: ToolResultContentItem[]): {
    values: unknown[];
} {
    const values: unknown[] = [];
    for (const item of content) {
        if (item.type === 'text' && item.text !== undefined) {
            values.push(parseToonToJson(item.text));
        } else {
            values.push({ ...item });
        }
    }
    return { values };
}

export function createHumanFormatter(): OutputFormatter {
    return {
        info(message: string): void {
            console.log(message);
        },
        error(error: unknown): void {
            const message =
                error instanceof Error ? error.message : String(error);
            console.error('Error:', message);
        },
        clientError(err: Error): void {
            console.error('Client error:', err);
        },
        result(content: ToolResultContentItem[]): void {
            for (const item of content) {
                if (item.type === 'text' && item.text !== undefined) {
                    const value = parseToonToJson(item.text);
                    console.log(JSON.stringify(value, null, 2));
                } else {
                    console.log(`[${item.type}]`, item);
                }
            }
        },
    };
}

export function createJsonFormatter(): OutputFormatter {
    return {
        info(message: string): void {
            console.error(message);
        },
        error(error: unknown): void {
            const message =
                error instanceof Error ? error.message : String(error);
            console.error(JSON.stringify({ error: message }));
        },
        clientError(err: Error): void {
            console.error(
                JSON.stringify({ error: err.message ?? String(err) })
            );
        },
        result(content: ToolResultContentItem[]): void {
            const { values } = formatResultPayload(content);
            if (values.length === 0) {
                console.log('null');
                return;
            }
            const payload = values.length === 1 ? values[0] : values;
            console.log(JSON.stringify(payload));
        },
    };
}
