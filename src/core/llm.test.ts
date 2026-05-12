import { describe, it, expect, beforeAll } from 'vitest';
import { NoOpCompactionStrategy } from './compaction.js';
import { Message, createMessage } from './types.js';
import { SessionStore } from './session.js';
import { createSession } from './session.js';

function makeStore(messages: Message[]): SessionStore {
    const session = createSession();
    session.messages = messages;
    return new SessionStore(session);
}

function messagesEqual(a: Message[], b: Message[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((msg, i) =>
        msg.role === b[i].role &&
        msg.content === b[i].content &&
        msg.reasoning_content === b[i].reasoning_content &&
        msg.tool_call_id === b[i].tool_call_id &&
        JSON.stringify(msg.tool_calls) === JSON.stringify(b[i].tool_calls)
    );
}

describe('NoOpCompactionStrategy', () => {
    let strategy: NoOpCompactionStrategy;

    beforeAll(() => {
        strategy = new NoOpCompactionStrategy();
    });

    describe('shouldTrigger', () => {
        it('should always return false', () => {
            const messages: Message[] = [
                createMessage({ role: 'user', content: 'test' }),
                createMessage({ role: 'assistant', content: 'response' })
            ];

            const result = strategy.shouldTrigger(makeStore(messages));
            expect(result).toBe(false);
        });

        it('should return false even with many messages', () => {
            const messages: Message[] = Array(100).fill(null).map(() => createMessage({ role: 'user', content: 'test' }));

            const result = strategy.shouldTrigger(makeStore(messages));
            expect(result).toBe(false);
        });
    });

    describe('doCompaction', () => {
        it('should return messages unchanged', async () => {
            const messages: Message[] = [
                createMessage({ role: 'user', content: 'first' }),
                createMessage({ role: 'assistant', content: 'reply' }),
                createMessage({ role: 'user', content: 'second' })
            ];

            const store = makeStore(messages);
            await strategy.doCompaction(store);
            expect(messagesEqual(store.getMessages(), messages)).toBe(true);
        });

        it('should not modify empty message list', async () => {
            const store = makeStore([]);
            await strategy.doCompaction(store);
            expect(store.getMessages()).toEqual([]);
        });

        it('should handle messages with all fields', async () => {
            const messages: Message[] = [
                createMessage({ role: 'assistant', content: 'response', reasoning_content: 'reasoning' }),
                createMessage({ role: 'tool', tool_call_id: '1', content: 'tool result' })
            ];
            (messages[0] as Message & { tool_calls: any[] }).tool_calls = [{ id: '1', function: { name: 'test', arguments: '{}' } }];

            const store = makeStore(messages);
            await strategy.doCompaction(store);
            expect(messagesEqual(store.getMessages(), messages)).toBe(true);
        });
    });
});
