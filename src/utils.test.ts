import { describe, it, expect, beforeAll } from 'vitest';
import { buildLLMPayload } from './utils.js';
import { Message } from './types.js';

describe('buildLLMPayload', () => {
    beforeAll(() => {
        // Ensure MODEL is set for the test
        process.env.MODEL = 'test-model';
    });

    it('should exclude reasoning messages', () => {
        const messages: Message[] = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', reasoning: 'Thinking...' },
            { role: 'assistant', content: 'Hi', reasoning: undefined },
            { role: 'assistant', content: 'weather is nice'}
        ];

        const payload = buildLLMPayload(messages, []);

        // Should include system + all 3 messages
        expect(payload.messages).toHaveLength(4);
        
        // Check system message
        expect(payload.messages[0].role).toBe('system');
        expect(payload.messages[0].content).toContain('Elite Frontend Coder');

        // Check that all original (non-reasoning) messages are preserved
        expect(payload.messages[1].role).toBe('user');
        expect(payload.messages[2].role).toBe('assistant');
        expect(payload.messages[2].content).toBe('Hi');
        expect(payload.messages[3].role).toBe('assistant');
        expect(payload.messages[3].content).toBe('weather is nice');
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
