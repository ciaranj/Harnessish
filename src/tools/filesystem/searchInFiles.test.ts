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
        // The test greps from '.' which searches the entire repo, including .h/sessions
        // If any session file happens to contain the pattern, the output overflows the 10MB buffer.
        // The grep also searches node_modules, which is slow and produces huge output.
        const result = await searchInFiles.execute({ pattern: 'searchInFiles' });

        expect(result.success).toBe(true);
        expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should cap per-file matches and total output for LLM-friendliness', async () => {
        let content = '';
        for (let i = 0; i < 60; i++) {
            content += `match_line_${i}\n`;
        }
        await writeFile('grep_test_many.txt', content, 'utf-8');

        const result = await searchInFiles.execute({ pattern: 'match_line_', path: 'grep_test_many.txt' });

        expect(result.success).toBe(true);
        expect(result.truncated).toBe(true);
        // Summary line + blank + file header + 5 capped matches + blank = ~8 lines
        expect(result.matches.length).toBeLessThanOrEqual(10);
        // First line should be a summary with total count and file count
        expect(result.matches[0]).toMatch(/Found 60 matches across \d+ files/);
    });

    it('should group results by file with headers', async () => {
        let content = 'fileA:line1\nfileB:line2\nfileA:line3\n';
        await writeFile('grep_test_group.txt', content, 'utf-8');

        const result = await searchInFiles.execute({ pattern: '.', path: 'grep_test_group.txt' });

        expect(result.success).toBe(true);
        // Should have summary, then file headers with match counts
        const hasSummary = result.matches.some(l => l.startsWith('Found') && l.includes('matches across'));
        const hasFileHeader = result.matches.some(l => l.includes('grep_test_group.txt') && l.includes('match'));
        expect(hasSummary).toBe(true);
        expect(hasFileHeader).toBe(true);
    });

    it('should cap at 5 matches per file', async () => {
        let content = '';
        for (let i = 0; i < 12; i++) {
            content += `single_file_line_${i}\n`;
        }
        await writeFile('grep_test_cap.txt', content, 'utf-8');

        const result = await searchInFiles.execute({ pattern: 'single_file_line_', path: 'grep_test_cap.txt' });

        expect(result.success).toBe(true);
        // 1 summary + 1 blank + 1 header + max 5 matches + 1 blank = ~9 lines
        expect(result.matches.length).toBeLessThanOrEqual(10);
        expect(result.truncated).toBe(true); // per-file cap (5) < actual matches (12)
    });

    it('should truncate long match lines to MAX_LINE_LENGTH', async () => {
        const longLine = 'x'.repeat(500);
        await writeFile('grep_test_long.txt', `short_line\n${longLine}\nanother_short\n`, 'utf-8');

        const result = await searchInFiles.execute({ pattern: '.', path: 'grep_test_long.txt' });

        expect(result.success).toBe(true);
        // Should have summary + blank + header + 3 matches (all < 5 cap) + blank = 6 lines
        expect(result.matches.length).toBeLessThanOrEqual(10);
        // The long line should be truncated with [...] marker
        const longMatch = result.matches.find(l => l.includes('xxx'));
        expect(longMatch).toBeDefined();
        expect(longMatch!.length).toBeLessThanOrEqual(210); // 2 spaces + 200 content + "[...]" = ~207
        expect(longMatch!).toMatch(/\[\.\.\.\]$/);
    });

    it('should cap total output lines across multiple files', async () => {
        let contentA = '';
        for (let i = 0; i < 6; i++) contentA += `file_a_line_${i}\n`;
        let contentB = '';
        for (let i = 0; i < 6; i++) contentB += `file_b_line_${i}\n`;

        await writeFile('grep_test_multi_a.txt', contentA, 'utf-8');
        await writeFile('grep_test_multi_b.txt', contentB, 'utf-8');

        const result = await searchInFiles.execute({ pattern: 'file_.*_line_', path: '.' });

        expect(result.success).toBe(true);
        // Total output should be capped at ~30 lines max
        expect(result.matches.length).toBeLessThanOrEqual(35);
    });

 // --- renderCallText tests ---

    it('renderCallText should show "Searching for" with default directory', () => {
        const text = searchInFiles.renderCallText({ pattern: 'hello' });
        expect(text).toBe('Searching for "hello" in .');
    });

    it('renderCallText should include custom path when provided', () => {
        const text = searchInFiles.renderCallText({ pattern: 'foo', path: 'src/tools' });
        expect(text).toBe('Searching for "foo" in src/tools');
    });

    it('renderCallText should handle regex patterns in output', () => {
        const text = searchInFiles.renderCallText({ pattern: '\\d+\\.ts' });
        expect(text).toBe('Searching for "\\d+\\.ts" in .');
    });

    it('renderCallText should handle empty pattern', () => {
        const text = searchInFiles.renderCallText({ pattern: '', path: './src' });
        expect(text).toBe('Searching for "" in ./src');
    });

    // --- Shell injection proof tests ---
    // All marker files go in /tmp/ so nothing in the workspace is touched.

    it('should stop $() command substitution in pattern', async () => {
        const marker = '/tmp/search_injection_proof_1.txt';
        // Ensure the marker does not exist before the test
        const { unlink } = await import('node:fs/promises');
        try { await unlink(marker); } catch { /* ignore */ }

        // The pattern "$(touch /tmp/search_injection_proof_1.txt)" will be injected
        // into the grep command as: grep ... "$(touch /tmp/search_injection_proof_1.txt)" .
        // If $() is not escaped, the touch command executes.
        await writeFile('grep_inj_a.txt', 'hello', 'utf-8');
        const result = await searchInFiles.execute({ pattern: '$(touch /tmp/search_injection_proof_1.txt)', path: 'grep_inj_a.txt' });

        expect(result.success).toBe(true);
        // The marker file proves $() was interpreted by the shell
        const { existsSync } = await import('node:fs');
        expect(existsSync(marker)).toBe(false);

        // Cleanup
        try { await unlink(marker); } catch { /* ignore */ }
        try { await unlink('grep_inj_a.txt'); } catch { /* ignore */ }
    });

    it('should stop backtick command substitution in pattern', async () => {
        const marker = '/tmp/search_injection_proof_2.txt';
        const { unlink } = await import('node:fs/promises');
        try { await unlink(marker); } catch { /* ignore */ }

        // Backtick substitution: `touch /tmp/search_injection_proof_2.txt`
        await writeFile('grep_inj_b.txt', 'hello', 'utf-8');
        const result = await searchInFiles.execute({ pattern: '`touch /tmp/search_injection_proof_2.txt`', path: 'grep_inj_b.txt' });

        expect(result.success).toBe(true);
        const { existsSync } = await import('node:fs');
        expect(existsSync(marker)).toBe(false);

        try { await unlink(marker); } catch { /* ignore */ }
        try { await unlink('grep_inj_b.txt'); } catch { /* ignore */ }
    });

    it('should stop unquoted path injection via semicolon', async () => {
        const marker = '/tmp/search_injection_proof_3.txt';
        const { unlink } = await import('node:fs/promises');
        try { await unlink(marker); } catch { /* ignore */ }

        // The path is passed literally to grep via spawn (no shell interpretation).
        // grep will look for a file named "; touch /tmp/search_injection_proof_3.txt ;"
        // which doesn't exist, so it returns exit code 2. The key assertion is that
        // the marker file was NOT created (proving no shell injection occurred).
        await writeFile('grep_inj_c.txt', 'hello', 'utf-8');
        await searchInFiles.execute({ pattern: 'hello', path: '; touch /tmp/search_injection_proof_3.txt ;' });

        const { existsSync } = await import('node:fs');
        expect(existsSync(marker)).toBe(false);

        try { await unlink(marker); } catch { /* ignore */ }
        try { await unlink('grep_inj_c.txt'); } catch { /* ignore */ }
    });

    afterEach(async () => {
        const { unlink } = await import('node:fs/promises');
        const files = [
            'grep_test.txt', 'grep_test2.txt', 'grep_test3.txt',
            'grep_test_many.txt', 'grep_test_group.txt', 'grep_test_cap.txt',
            'grep_test_long.txt', 'grep_test_multi_a.txt', 'grep_test_multi_b.txt'
        ];
        for (const file of files) {
            try { await unlink(file); } catch { /* ignore */ }
        }
    });
});
