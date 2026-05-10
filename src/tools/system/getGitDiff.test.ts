import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getGitDiff } from './getGitDiff.js';

describe('getGitDiff — shell injection', () => {
    const markers = [
        '/tmp/get_git_diff_injection_proof.txt',
        '/tmp/get_git_diff_file_created_proof.txt',
        '/tmp/get_git_diff_dollar_injection_proof.txt',
        '/tmp/get_git_diff_backtick_injection_proof.txt',
        '/tmp/get_git_diff_read_proof.txt',
    ];

    beforeEach(() => {
        process.env.MODEL = 'test-model';
    });

    afterEach(async () => {
        const { unlink } = await import('node:fs/promises');
        for (const m of markers) {
            try { await unlink(m); } catch { /* ignore */ }
        }
    });

    it('should stop semicolon command injection via path', async () => {
        const { existsSync } = await import('node:fs');

        const result = await getGitDiff.execute({ path: '; touch /tmp/get_git_diff_injection_proof.txt ; #' });

        expect(result.success).toBe(true);
        expect(existsSync(markers[0])).toBe(false);
    });

    it('should stop semicolon injection via path that creates a file', async () => {
        const { existsSync } = await import('node:fs');

        const result = await getGitDiff.execute({ path: '; touch /tmp/get_git_diff_file_created_proof.txt ; #' });

        expect(result.success).toBe(true);
        expect(existsSync(markers[1])).toBe(false);
    });

    it('should stop subshell $(...) injection via path', async () => {
        const { existsSync } = await import('node:fs');

        const result = await getGitDiff.execute({
            path: '; $(echo injection > /tmp/get_git_diff_dollar_injection_proof.txt) ; #'
        });

        expect(result.success).toBe(true);
        expect(existsSync(markers[2])).toBe(false);
    });

    it('should stop backtick command substitution via path', async () => {
        const { existsSync } = await import('node:fs');

        const result = await getGitDiff.execute({
            path: '; `touch /tmp/get_git_diff_backtick_injection_proof.txt` ; #'
        });

        expect(result.success).toBe(true);
        expect(existsSync(markers[3])).toBe(false);
    });

    it('should stop path traversal that reads external files via injection', async () => {
        const { readFileSync, existsSync } = await import('node:fs');

        const result = await getGitDiff.execute({
            path: '; hostname > /tmp/get_git_diff_read_proof.txt ; #'
        });

        expect(result.success).toBe(true);

        if (!existsSync(markers[4])) {
            // File not created — no injection, test passes
            return;
        }

        if (readFileSync(markers[4], 'utf-8').trim().length > 0) {
            throw new Error('Shell injection: external file was read and redirected');
        }
    });
});
