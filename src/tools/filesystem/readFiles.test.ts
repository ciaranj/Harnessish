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
        const file2 = 'src/core/types.ts';

        const result = await readFiles.execute({ paths: [{ path: file1 }, { path: file2 }] });

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
        const result = await readFiles.execute({ paths: [{ path: 'nonexistent_file.txt' }] });

        expect(result).toHaveLength(1);
        expect(result[0].path).toBe('nonexistent_file.txt');
        expect(result[0].success).toBe(false);
        expect(result[0].error).toBeDefined();
        expect(typeof result[0].error).toBe('string');
        expect(result[0].content).toBeUndefined();
    });

    it('should handle mixed valid and invalid paths', async () => {
        const result = await readFiles.execute({ paths: [{ path: 'src/utils.ts' }, { path: 'does_not_exist.txt' }] });

        expect(result).toHaveLength(2);
        expect(result[0].success).toBe(true);
        expect(result[0].content).toBeDefined();
        expect(result[1].success).toBe(false);
        expect(result[1].error).toBeDefined();
    });

    it('should handle multiple non-existent files', async () => {
        const result = await readFiles.execute({ paths: [{ path: 'file1.txt' }, { path: 'file2.txt' }, { path: 'file3.txt' }] });

        expect(result).toHaveLength(3);
        for (const item of result) {
            expect(item.success).toBe(false);
            expect(item.error).toBeDefined();
        }
    });

    it('should return content that contains expected code', async () => {
        const result = await readFiles.execute({ paths: [{ path: 'src/utils.ts' }] });

        expect(result[0].success).toBe(true);
        expect(result[0].content).toContain('buildLLMPayload');
        expect(result[0].content).toContain('export interface LLMPayload');
    });

    it('should return error message with meaningful text', async () => {
        const result = await readFiles.execute({ paths: [{ path: 'nonexistent_file.txt' }] });

        expect(result[0].success).toBe(false);
        expect(result[0].error).toContain('ENOENT');
    });

    it('should preserve file content with newlines and formatting', async () => {
        const result = await readFiles.execute({ paths: [{ path: 'src/core/types.ts' }] });

        expect(result[0].success).toBe(true);
        expect(result[0].content).toContain('\n');
        expect(result[0].content).toContain('export type Message');
    });

    // --- Line-range tests (using unified paths format) ---

    it('should read a specific line range from a file', async () => {
        const result = await readFiles.execute({
            paths: [{ path: 'src/utils.ts', start: 1, end: 5 }]
        });

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(result[0].path).toBe('src/utils.ts');
        expect(result[0].lineCount).toBe(5);
        const lines = result[0].content!.split('\n');
        expect(lines).toHaveLength(5);
    });

    it('should read a middle line range from a file', async () => {
        const result = await readFiles.execute({
            paths: [{ path: 'src/utils.ts', start: 10, end: 15 }]
        });

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(result[0].lineCount).toBe(6); // inclusive end
        const lines = result[0].content!.split('\n');
        expect(lines).toHaveLength(6);
    });

    it('should clamp line start to 1 if below', async () => {
        const result = await readFiles.execute({
            paths: [{ path: 'src/utils.ts', start: -5, end: 3 }]
        });

        expect(result[0].success).toBe(true);
        expect(result[0].lineCount).toBe(3);
    });

    it('should clamp line end to file length if above', async () => {
        const result = await readFiles.execute({
            paths: [{ path: 'src/utils.ts', start: 1, end: 9999 }]
        });

        expect(result[0].success).toBe(true);
        const contentLines = result[0].content!.split('\n');
        expect(result[0].lineCount).toBe(contentLines.length);
    });

    it('should return error when start > end', async () => {
        const result = await readFiles.execute({
            paths: [{ path: 'src/utils.ts', start: 10, end: 5 }]
        });

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(false);
        expect(result[0].error).toContain('out of bounds');
    });

    it('should return error when both start and end are out of bounds', async () => {
        const result = await readFiles.execute({
            paths: [{ path: 'src/utils.ts', start: 9999, end: 10000 }]
        });

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(false);
    });

    it('should handle mixed full reads and line-range reads in one call', async () => {
        const result = await readFiles.execute({
            paths: [
                { path: 'src/utils.ts' },
                { path: 'src/core/types.ts', start: 1, end: 3 }
            ]
        });

        expect(result).toHaveLength(2);
        // utils.ts should be full read (no lineCount)
        const fullRead = result.find(r => r.path === 'src/utils.ts');
        expect(fullRead?.success).toBe(true);
        expect(fullRead?.lineCount).toBeUndefined();

        // types.ts should be line-range read
        const rangeRead = result.find(r => r.path === 'src/core/types.ts');
        expect(rangeRead?.success).toBe(true);
        expect(rangeRead?.lineCount).toBe(3);
    });

    it('should handle multiple line ranges across different files', async () => {
        const result = await readFiles.execute({
            paths: [
                { path: 'src/utils.ts', start: 1, end: 2 },
                { path: 'src/core/types.ts', start: 1, end: 2 }
            ]
        });

        expect(result).toHaveLength(2);
        expect(result[0].lineCount).toBe(2);
        expect(result[1].lineCount).toBe(2);
    });

    it('should handle non-existent file in line ranges', async () => {
        const result = await readFiles.execute({
            paths: [{ path: 'no_such_file.ts', start: 1, end: 5 }]
        });

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(false);
        expect(result[0].error).toBeDefined();
    });

    it('should read a single line when start equals end', async () => {
        const result = await readFiles.execute({
            paths: [{ path: 'src/utils.ts', start: 1, end: 1 }]
        });

        expect(result[0].success).toBe(true);
        expect(result[0].lineCount).toBe(1);
    });

    it('should handle multiple line-range slices of the same file', async () => {
        const result = await readFiles.execute({
            paths: [
                { path: 'src/utils.ts', start: 1, end: 3 },
                { path: 'src/utils.ts', start: 8, end: 12 },
                { path: 'src/utils.ts', start: 1, end: 3 }
            ]
        });

        expect(result).toHaveLength(3);
        expect(result[0].success).toBe(true);
        expect(result[0].lineCount).toBe(3);
        expect(result[1].success).toBe(true);
        expect(result[1].lineCount).toBe(5);
        expect(result[2].success).toBe(true);
        expect(result[2].lineCount).toBe(3);

        // Duplicate ranges should return identical content
        expect(result[0].content).toBe(result[2].content);
    });
});
