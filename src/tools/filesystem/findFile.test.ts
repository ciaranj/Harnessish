import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findFile } from './findFile.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path'
describe('findFile', () => {
    const testDir = 'test_find_root';

    beforeEach(async () => {
        process.env.MODEL = 'test-model';
        try { await mkdir(testDir + "/xxxx" , { recursive: true }); } catch { /* ignore */ }
    });

    afterEach(async () => {
        try { await rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('should find a file by exact name', async () => {
        await writeFile(`${testDir}/target.txt`, 'content', 'utf-8');

        const result = await findFile.execute({ pattern: 'target.txt', path: testDir });

        expect(result.success).toBe(true);
        expect(result.files).toHaveLength(1);
        expect(result.files[0]).toContain('target.txt');
    });

    it('should find files by glob pattern', async () => {
        await writeFile(`${testDir}/file1.ts`, 'c1', 'utf-8');
        await writeFile(`${testDir}/file2.ts`, 'c2', 'utf-8');
        await writeFile(`${testDir}/file1.js`, 'j1', 'utf-8');

        const result = await findFile.execute({ pattern: '*.ts', path: testDir });

        expect(result.success).toBe(true);
        expect(result.files).toHaveLength(2);
        for (const f of result.files) {
            expect(f).toContain('.ts');
        }
    });

    it('should search recursively in subdirectories', async () => {
        await mkdir(`${testDir}/subdir`, { recursive: true });
        await writeFile(`${testDir}/root_file.txt`, 'r', 'utf-8');
        await writeFile(`${testDir}/subdir/nested_file.txt`, 'n', 'utf-8');

        const result = await findFile.execute({ pattern: 'nested_file.txt', path: testDir });

        expect(result.success).toBe(true);
        expect(result.files).toHaveLength(1);
        expect(result.files[0]).toContain('subdir');
    });

    it('should return empty array when no files match', async () => {
        const result = await findFile.execute({ pattern: '*.xyz', path: testDir });

        expect(result.success).toBe(true);
        expect(result.files).toHaveLength(0);
    });

    it('should return error for non-existent directory', async () => {
        const result = await findFile.execute({ pattern: '*.txt', path: 'nonexistent_dir_12345' });

        expect(result.success).toBe(false);
        expect(result.files).toHaveLength(0);
    });

    it('should default to current directory when path not provided', async () => {
        const result = await findFile.execute({ pattern: 'findFile.test.ts' });

        expect(result.success).toBe(true);
        expect(result.files.length).toBeGreaterThanOrEqual(1);
        expect(result.files[0]).toContain('findFile.test.ts');
    });

    it('should not match directories', async () => {
        await mkdir(`${testDir}/mydir`, { recursive: true });
        await writeFile(`${testDir}/mydir/file.txt`, 'f', 'utf-8');

        const result = await findFile.execute({ pattern: 'mydir', path: testDir });

        expect(result.success).toBe(true);
        expect(result.files.length).toBe(0);
    });

    it('should return absolute paths', async () => {
        await writeFile(`${testDir}/xxxx/../file`, 'content', 'utf-8');

        const result = await findFile.execute({ pattern: 'file', path: testDir });

        expect(result.success).toBe(true);
        expect(result.files[0]).not.toContain('.');
        expect(result.files[0]).toBe(path.resolve(`${testDir}/file`));
    });
});
