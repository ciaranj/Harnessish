import { describe, it, expect, beforeAll } from 'vitest';
import { buildLLMPayload } from './utils.js';
import { Message } from './types.js';

describe('buildLLMPayload', () => {
    beforeAll(() => {
        // Ensure MODEL is set for the test
        process.env.MODEL = 'test-model';
    });

    it('should include the tools array in the payload', () => {
        const tools = [{ type: 'function', function: { name: 'test_tool' } }];
        const payload = buildLLMPayload([], tools);

        expect(payload.tools).toEqual(tools);
    });

    it('should set stream and cache_prompt to true', () => {
        const payload = buildLLMPayload([], []);

        expect(payload.stream).toBe(true);
        expect(payload.cache_prompt).toBe(true);
    });
});
