import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { searchInFiles } from './searchInFiles.js';
import { writeFile } from 'node:fs/promises';

describe('searchInFiles', () => {
    beforeEach(() => {
        process.env.MODEL = 'test-model';
    });

    it('should find matching lines in a file', async () => {
        await writeFile('grep_test.txt', 'hello world\nfoo bar\nhello again', 'utf-8');

        const result = await searchInFiles.execute({ pattern: 'hello', path: 'grep_test.txt' });

        expect(result.success).toBe(true);
        expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty matches when no pattern found', async () => {
        await writeFile('grep_test2.txt', 'xyz abc def', 'utf-8');

        const result = await searchInFiles.execute({ pattern: 'nonexistent_pattern_xyz', path: 'grep_test2.txt' });

        expect(result.success).toBe(true);
        expect(result.matches).toHaveLength(0);
    });

    it('should support regex patterns', async () => {
        await writeFile('grep_test3.txt', 'abc123\nxyz789\nabc456', 'utf-8');

        const result = await searchInFiles.execute({ pattern: 'abc\\d+', path: 'grep_test3.txt' });

        expect(result.success).toBe(true);
        expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should default to current directory when path not provided', async () => {
        const result = await searchInFiles.execute({ pattern: 'searchInFiles' });

        expect(result.success).toBe(true);
        expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should truncate results when exceeding 50 lines', async () => {
        let content = '';
        for (let i = 0; i < 60; i++) {
            content += `match_line_${i}\n`;
        }
        await writeFile('grep_test_many.txt', content, 'utf-8');

        const result = await searchInFiles.execute({ pattern: 'match_line_', path: 'grep_test_many.txt' });

        expect(result.success).toBe(true);
        expect(result.matches.length).toBe(50);
    });

    afterEach(async () => {
        const { unlink } = await import('node:fs/promises');
        try { await unlink('grep_test.txt'); } catch { /* ignore */ }
        try { await unlink('grep_test2.txt'); } catch { /* ignore */ }
        try { await unlink('grep_test3.txt'); } catch { /* ignore */ }
        try { await unlink('grep_test_many.txt'); } catch { /* ignore */ }
    });
});
