import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NoOpCompactionStrategy } from './compaction.js';
import { Message, Stats } from './types.js';

describe('NoOpCompactionStrategy', () => {
    let strategy: NoOpCompactionStrategy;

    beforeEach(() => {
        strategy = new NoOpCompactionStrategy();
    });

    describe('shouldTrigger', () => {
        it('should always return false', () => {
            const messages: Message[] = [
                { role: 'user', content: 'test' },
                { role: 'assistant', content: 'response' }
            ];
            const stats: Stats = {
                tokens: 100,
                tps: 10,
                status: 'generating',
                contextSize: 50,
                cachedContextSize: 25
            };

            const result = strategy.shouldTrigger(messages, stats);
            expect(result).toBe(false);
        });

        it('should return false even with many messages', () => {
            const messages: Message[] = Array(100).fill({ role: 'user', content: 'test' });
            const stats: Stats = {
                tokens: 10000,
                tps: 0,
                status: 'idle',
                contextSize: 5000,
                cachedContextSize: 2500
            };

            const result = strategy.shouldTrigger(messages, stats);
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
            const stats: Stats = {
                tokens: 50,
                tps: 5,
                status: 'idle',
                contextSize: 20,
                cachedContextSize: 10
            };

            const result = await strategy.doCompaction(messages, stats);
            expect(result.messages).toEqual(messages);
        });

        it('should not modify empty message list', async () => {
            const messages: Message[] = [];
            const stats: Stats = {
                tokens: 0,
                tps: 0,
                status: 'idle',
                contextSize: 0,
                cachedContextSize: 0
            };

            const result = await strategy.doCompaction(messages, stats);
            expect(result.messages).toEqual([]);
        });

        it('should not return any stats changes', async () => {
            const messages: Message[] = [{ role: 'user', content: 'test' }];
            const stats: Stats = {
                tokens: 10,
                tps: 2,
                status: 'thinking',
                contextSize: 5,
                cachedContextSize: 3
            };

            const result = await strategy.doCompaction(messages, stats);
            expect(result.stats).toBeUndefined();
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
            const stats: Stats = {
                tokens: 100,
                tps: 10,
                status: 'tool_calling',
                contextSize: 50,
                cachedContextSize: 25
            };

            const result = await strategy.doCompaction(messages, stats);
            expect(result.messages).toEqual(messages);
        });
    });
});
