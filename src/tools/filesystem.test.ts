import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFiles } from './filesystem.js';
import { writeFile, unlink } from 'node:fs/promises';

describe('readFiles', () => {
    const testFiles: string[] = [];

    beforeEach(async () => {
        process.env.MODEL = 'test-model';
    });

    afterEach(async () => {
        for (const file of testFiles) {
            try { await unlink(file); } catch { /* ignore */ }
        }
    });

    it('should return empty array for empty input', async () => {
        const result = await readFiles([]);
        const parsed = JSON.parse(result);
        expect(parsed).toEqual([]);
    });

    it('should read multiple valid files successfully', async () => {
        const file1 = 'src/utils.ts';
        const file2 = 'src/types.ts';

        const result = await readFiles([file1, file2]);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveLength(2);
        expect(parsed[0].path).toBe(file1);
        expect(parsed[0].success).toBe(true);
        expect(parsed[0].content).toBeDefined();
        expect(typeof parsed[0].content).toBe('string');
        expect(parsed[0].error).toBeUndefined();

        expect(parsed[1].path).toBe(file2);
        expect(parsed[1].success).toBe(true);
        expect(parsed[1].content).toBeDefined();
        expect(parsed[1].error).toBeUndefined();
    });

    it('should return error for non-existent file', async () => {
        const result = await readFiles(['nonexistent_file.txt']);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveLength(1);
        expect(parsed[0].path).toBe('nonexistent_file.txt');
        expect(parsed[0].success).toBe(false);
        expect(parsed[0].error).toBeDefined();
        expect(typeof parsed[0].error).toBe('string');
        expect(parsed[0].content).toBeUndefined();
    });

    it('should handle mixed valid and invalid paths', async () => {
        const result = await readFiles(['src/utils.ts', 'does_not_exist.txt']);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveLength(2);
        expect(parsed[0].success).toBe(true);
        expect(parsed[0].content).toBeDefined();
        expect(parsed[1].success).toBe(false);
        expect(parsed[1].error).toBeDefined();
    });

    it('should handle multiple non-existent files', async () => {
        const result = await readFiles(['file1.txt', 'file2.txt', 'file3.txt']);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveLength(3);
        for (const item of parsed) {
            expect(item.success).toBe(false);
            expect(item.error).toBeDefined();
        }
    });

    it('should return content that contains expected code', async () => {
        const result = await readFiles(['src/utils.ts']);
        const parsed = JSON.parse(result);

        expect(parsed[0].success).toBe(true);
        expect(parsed[0].content).toContain('buildLLMPayload');
        expect(parsed[0].content).toContain('export interface LLMPayload');
    });

    it('should return error message with meaningful text', async () => {
        const result = await readFiles(['nonexistent_file.txt']);
        const parsed = JSON.parse(result);

        expect(parsed[0].success).toBe(false);
        expect(parsed[0].error).toContain('ENOENT');
    });

    it('should preserve file content with newlines and formatting', async () => {
        const result = await readFiles(['src/types.ts']);
        const parsed = JSON.parse(result);

        expect(parsed[0].success).toBe(true);
        expect(parsed[0].content).toContain('\n');
        expect(parsed[0].content).toContain('export type Message');
    });
});
