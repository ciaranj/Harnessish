import { describe, it, expect } from 'vitest';
import { NoOpCompactionStrategy, RunningMemoryStrategy } from './compaction.js';
import { Message, Stats } from './types.js';

function makeMsg(role: Message['role'], content?: string, reasoning?: string): Message {
    const msg: Message = { role, content };
    if (reasoning !== undefined) {
        (msg as Message & { reasoning_content: string }).reasoning_content = reasoning;
    }
    return msg;
}

function makeStats(contextSize: number): Stats {
    return { tokens: 0, tps: 0, status: 'idle', contextSize, cachedContextSize: 0 };
}

describe('NoOpCompactionStrategy', () => {
    it('shouldTrigger always returns false', () => {
        const strategy = new NoOpCompactionStrategy();
        expect(strategy.shouldTrigger([], makeStats(100))).toBe(false);
        expect(strategy.shouldTrigger([makeMsg('user', 'hi')], makeStats(999999))).toBe(false);
    });

    it('doCompaction returns messages unchanged', async () => {
        const strategy = new NoOpCompactionStrategy();
        const messages = [
            makeMsg('system', 'You are helpful'),
            makeMsg('user', 'Hello'),
            makeMsg('assistant', 'Hi there'),
        ];
        const result = await strategy.doCompaction(messages, makeStats(100));
        expect(result.messages).toEqual(messages);
    });
});

describe('RunningMemoryStrategy', () => {
    it('shouldTrigger returns false when context is below threshold', () => {
        const strategy = new RunningMemoryStrategy({ maxContextSize: 102400, threshold: 0.8 });
        // threshold = 0.8 * 102400 = 81920
        expect(strategy.shouldTrigger([], makeStats(100))).toBe(false);
        expect(strategy.shouldTrigger([], makeStats(80000))).toBe(false);
    });

    it('shouldTrigger returns true when context exceeds threshold', () => {
        const strategy = new RunningMemoryStrategy({ maxContextSize: 102400, threshold: 0.8 });
        // threshold = 81920
        expect(strategy.shouldTrigger([], makeStats(82000))).toBe(true);
    });

    it('shouldTrigger respects custom threshold', () => {
        const strategy = new RunningMemoryStrategy({ maxContextSize: 100000, threshold: 0.5 });
        // threshold = 0.5 * 100000 = 50000
        expect(strategy.shouldTrigger([], makeStats(49000))).toBe(false);
        expect(strategy.shouldTrigger([], makeStats(51000))).toBe(true);
    });

      it('doCompaction keeps recent turns with full fidelity', async () => {
        const strategy = new RunningMemoryStrategy({ recentTurns: 2, maxToolOutputSize: 2000, maxContextSize: 102400 });
        const messages: Message[] = [];

        // Add 10 older turns
        for (let i = 0; i < 10; i++) {
            messages.push(makeMsg('user', `Old question ${i}`));
            messages.push(makeMsg('assistant', `Old answer ${i}`, `Old reasoning ${i}`));
        }

        // Add 2 recent turns (should be kept with full fidelity)
        messages.push(makeMsg('user', 'Recent question'));
        messages.push(makeMsg('assistant', 'Recent answer', 'Recent deep reasoning'));

        const result = await strategy.doCompaction(messages, makeStats(90000));

        // The last assistant message should retain its reasoning_content
        const lastMsg = result.messages[result.messages.length - 1];
        expect(lastMsg?.role).toBe('assistant');
        expect(lastMsg?.content).toBe('Recent answer');
        expect(lastMsg?.reasoning_content).toBe('Recent deep reasoning');
    });

    it('doCompaction drops reasoning_content from older turns', async () => {
        const strategy = new RunningMemoryStrategy({ recentTurns: 2, maxToolOutputSize: 2000, maxContextSize: 102400 });
        const messages: Message[] = [];

        // Add 8 older turns with reasoning (recentTurns=2 keeps last 2 assistants)
        for (let i = 0; i < 8; i++) {
            messages.push(makeMsg('user', `Old question ${i}`));
            messages.push(makeMsg('assistant', `Old answer ${i}`, `Old reasoning ${i}`));
        }

        // Add 2 recent turns
        messages.push(makeMsg('user', 'Recent question'));
        messages.push(makeMsg('assistant', 'Recent answer', 'Recent deep reasoning'));

        const result = await strategy.doCompaction(messages, makeStats(90000));

        // Older assistant messages (first 6 of 8) should NOT have reasoning_content.
        // The last 2 assistants (index 7 and the recent one) are kept in the recent window.
        const olderAssistants = result.messages.filter(
            (m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('Old answer'),
        );
        expect(olderAssistants.length).toBeGreaterThanOrEqual(6);

        // The first 6 should be stripped of reasoning_content; the last 2 are in the recent window
        const strippedCount = olderAssistants.filter((m) => m.reasoning_content === undefined).length;
        expect(strippedCount).toBeGreaterThanOrEqual(6);
    });

    it('doCompaction externalizes large tool outputs to CONTEXT.md', async () => {
        const fs = await import('node:fs');
        const os = await import('node:os');
        const pathMod = await import('node:path');

        const tmpDir = fs.default.mkdtempSync(pathMod.default.join(os.default.tmpdir(), 'compaction-test-'));
        const originalCwd = process.cwd;
        Object.defineProperty(process, 'cwd', { value: () => tmpDir });

        try {
            const strategy = new RunningMemoryStrategy({ recentTurns: 1, maxToolOutputSize: 100, maxContextSize: 102400 });
            const messages: Message[] = [
                makeMsg('user', 'Question'),
                makeMsg('assistant', 'Let me check...'),
                makeMsg('tool', 'x'.repeat(200)), // Large tool output
                makeMsg('tool', 'small'), // Small tool output
                makeMsg('user', 'Follow up'),
                makeMsg('assistant', 'Done'),
            ];

            const result = await strategy.doCompaction(messages, makeStats(90000));

            // The large tool output should be replaced with a reference
            const refMsg = result.messages.find((m) => typeof m.content === 'string' && m.content.includes('externalized to CONTEXT.md'));
            expect(refMsg).toBeDefined();
            expect(refMsg?.content).toContain('200 bytes');

            // The small tool output should remain unchanged
            const smallMsg = result.messages.find((m) => m.content === 'small');
            expect(smallMsg).toBeDefined();
            expect(smallMsg?.role).toBe('tool');

            // CONTEXT.md should have been created with the large output
            const contextMdPath = pathMod.default.join(tmpDir, 'CONTEXT.md');
            expect(fs.default.existsSync(contextMdPath)).toBe(true);
            const contextContent = fs.default.readFileSync(contextMdPath, 'utf-8');
            expect(contextContent).toContain('x'.repeat(200));

            // Result should include contextMdPath
            expect(result.contextMdPath).toBe(contextMdPath);
        } finally {
            Object.defineProperty(process, 'cwd', { value: originalCwd });
            fs.default.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('doCompaction returns early when not enough messages', async () => {
        const strategy = new RunningMemoryStrategy({ recentTurns: 6, maxContextSize: 102400 });
        const messages = [makeMsg('user', 'hi'), makeMsg('assistant', 'hello')];
        const result = await strategy.doCompaction(messages, makeStats(90000));
        expect(result.messages).toEqual(messages);
    });

    it('doCompaction preserves user messages in older turns', async () => {
        const strategy = new RunningMemoryStrategy({ recentTurns: 1, maxToolOutputSize: 2000, maxContextSize: 102400 });
        const messages: Message[] = [
            makeMsg('user', 'First question'),
            makeMsg('assistant', 'First answer'),
            makeMsg('user', 'Second question'),
            makeMsg('assistant', 'Second answer'),
            makeMsg('user', 'Third question'),
            makeMsg('assistant', 'Third answer'),
        ];

        const result = await strategy.doCompaction(messages, makeStats(90000));

        // All user messages should be preserved as-is
        const userMessages = result.messages.filter((m) => m.role === 'user');
        expect(userMessages).toHaveLength(3);
        expect(userMessages[0].content).toBe('First question');
        expect(userMessages[1].content).toBe('Second question');
        expect(userMessages[2].content).toBe('Third question');
    });
});
