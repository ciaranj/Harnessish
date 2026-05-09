import { describe, it, expect, beforeAll } from 'vitest';
import { NoOpCompactionStrategy } from './compaction.js';
import { Message } from './types.js';
import { SessionStore } from './session.js';
import { createSession } from './session.js';

function makeStore(messages: Message[]): SessionStore {
    const session = createSession();
    session.messages = messages;
    return new SessionStore(session);
}

describe('NoOpCompactionStrategy', () => {
    let strategy: NoOpCompactionStrategy;

    beforeAll(() => {
        strategy = new NoOpCompactionStrategy();
    });

    describe('shouldTrigger', () => {
        it('should always return false', () => {
            const messages: Message[] = [
                { role: 'user', content: 'test' },
                { role: 'assistant', content: 'response' }
            ];

            const result = strategy.shouldTrigger(makeStore(messages));
            expect(result).toBe(false);
        });

        it('should return false even with many messages', () => {
            const messages: Message[] = Array(100).fill({ role: 'user', content: 'test' });

            const result = strategy.shouldTrigger(makeStore(messages));
            expect(result).toBe(false);
        });
    });

    describe('doCompaction', () => {
        it('should return messages unchanged', async () => {
            const messages: Message[] = [
                { role: 'user', content: 'first' },
                { role: 'assistant', content: 'reply' },
                { role: 'user', content: 'second' }
            ];

            const store = makeStore(messages);
            await strategy.doCompaction(store);
            expect(store.getMessages()).toEqual(messages);
        });

        it('should not modify empty message list', async () => {
            const store = makeStore([]);
            await strategy.doCompaction(store);
            expect(store.getMessages()).toEqual([]);
        });

        it('should handle messages with all fields', async () => {
            const messages: Message[] = [
                {
                    role: 'assistant',
                    content: 'response',
                    reasoning_content: 'reasoning',
                    tool_calls: [{ id: '1', function: { name: 'test', arguments: '{}' } }]
                },
                {
                    role: 'tool',
                    tool_call_id: '1',
                    content: 'tool result'
                }
            ];

            const store = makeStore(messages);
            await strategy.doCompaction(store);
            expect(store.getMessages()).toEqual(messages);
        });
    });
});
