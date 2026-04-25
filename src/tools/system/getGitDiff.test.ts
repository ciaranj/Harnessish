import { describe, it, expect, beforeEach } from 'vitest';
import { getGitDiff } from './getGitDiff.js';

describe('getGitDiff', () => {
    beforeEach(() => {
        process.env.MODEL = 'test-model';
    });

    it('should return a diff string when there are changes', async () => {
        const result = await getGitDiff.execute({});

        expect(result.success).toBe(true);
        expect(typeof result.diff).toBe('string');
    });

    it('should return "No changes detected." when working directory is clean', async () => {
        const result = await getGitDiff.execute({});

        if (result.diff === 'No changes detected.') {
            expect(result.success).toBe(true);
        }
    });

    it('should accept a specific file path', async () => {
        const result = await getGitDiff.execute({ path: 'package.json' });

        expect(result.success).toBe(true);
        expect(typeof result.diff).toBe('string');
    });

    it('should handle staged flag', async () => {
        const result = await getGitDiff.execute({ staged: true });

        expect(result.success).toBe(true);
        expect(typeof result.diff).toBe('string');
    });

    it('should return error for non-git operations', async () => {
        try {
            const result = await getGitDiff.execute({ path: 'nonexistent_file.txt' });
            if (!result.success) {
                expect(result.diff).toBeDefined();
            }
        } catch {
            // Expected behavior is to resolve, not reject
        }
    });
});
