import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFiles } from './readFiles.js';
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
        const result = await readFiles.execute({ paths: [] });
        expect(result).toEqual([]);
    });

    it('should read multiple valid files successfully', async () => {
        const file1 = 'src/utils.ts';
        const file2 = 'src/types.ts';

        const result = await readFiles.execute({ paths: [file1, file2] });

        expect(result).toHaveLength(2);
        expect(result[0].path).toBe(file1);
        expect(result[0].success).toBe(true);
        expect(result[0].content).toBeDefined();
        expect(typeof result[0].content).toBe('string');
        expect(result[0].error).toBeUndefined();

        expect(result[1].path).toBe(file2);
        expect(result[1].success).toBe(true);
        expect(result[1].content).toBeDefined();
        expect(result[1].error).toBeUndefined();
    });

    it('should return error for non-existent file', async () => {
        const result = await readFiles.execute({ paths: ['nonexistent_file.txt'] });

        expect(result).toHaveLength(1);
        expect(result[0].path).toBe('nonexistent_file.txt');
        expect(result[0].success).toBe(false);
        expect(result[0].error).toBeDefined();
        expect(typeof result[0].error).toBe('string');
        expect(result[0].content).toBeUndefined();
    });

    it('should handle mixed valid and invalid paths', async () => {
        const result = await readFiles.execute({ paths: ['src/utils.ts', 'does_not_exist.txt'] });

        expect(result).toHaveLength(2);
        expect(result[0].success).toBe(true);
        expect(result[0].content).toBeDefined();
        expect(result[1].success).toBe(false);
        expect(result[1].error).toBeDefined();
    });

    it('should handle multiple non-existent files', async () => {
        const result = await readFiles.execute({ paths: ['file1.txt', 'file2.txt', 'file3.txt'] });

        expect(result).toHaveLength(3);
        for (const item of result) {
            expect(item.success).toBe(false);
            expect(item.error).toBeDefined();
        }
    });

    it('should return content that contains expected code', async () => {
        const result = await readFiles.execute({ paths: ['src/utils.ts'] });

        expect(result[0].success).toBe(true);
        expect(result[0].content).toContain('buildLLMPayload');
        expect(result[0].content).toContain('export interface LLMPayload');
    });

    it('should return error message with meaningful text', async () => {
        const result = await readFiles.execute({ paths: ['nonexistent_file.txt'] });

        expect(result[0].success).toBe(false);
        expect(result[0].error).toContain('ENOENT');
    });

    it('should preserve file content with newlines and formatting', async () => {
        const result = await readFiles.execute({ paths: ['src/types.ts'] });

        expect(result[0].success).toBe(true);
        expect(result[0].content).toContain('\n');
        expect(result[0].content).toContain('export type Message');
    });
});
