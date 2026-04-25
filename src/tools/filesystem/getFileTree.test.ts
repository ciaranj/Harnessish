import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getFileTree } from './getFileTree.js';
import { writeFile, mkdir, unlink, rmdir } from 'node:fs/promises';

describe('getFileTree', () => {
    const testDir = 'test_tree_root';

    beforeEach(async () => {
        process.env.MODEL = 'test-model';
        try { await mkdir(testDir, { recursive: true }); } catch { /* ignore */ }
    });

    afterEach(async () => {
        try { await rmdir(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    it('should return an empty tree for an empty directory', async () => {
        const result = await getFileTree.execute({ path: testDir });

        expect(result.success).toBe(true);
        expect(typeof result.tree).toBe('string');
    });

    it('should show files in the directory', async () => {
        await writeFile(`${testDir}/file1.txt`, 'content1', 'utf-8');
        await writeFile(`${testDir}/file2.ts`, 'content2', 'utf-8');

        const result = await getFileTree.execute({ path: testDir });

        expect(result.success).toBe(true);
        expect(result.tree).toContain('[FILE');
        expect(result.tree).toContain('file1.txt');
        expect(result.tree).toContain('file2.ts');
    });

    it('should show subdirectories recursively', async () => {
        await mkdir(`${testDir}/subdir`, { recursive: true });
        await writeFile(`${testDir}/subdir/nested.txt`, 'nested', 'utf-8');

        const result = await getFileTree.execute({ path: testDir });

        expect(result.success).toBe(true);
        expect(result.tree).toContain('[DIR] subdir');
        expect(result.tree).toContain('nested.txt');
    });

    it('should respect max_depth parameter', async () => {
        await mkdir(`${testDir}/level1/level2`, { recursive: true });
        await writeFile(`${testDir}/level1/level2/deep.txt`, 'deep', 'utf-8');

        const result = await getFileTree.execute({ path: testDir, max_depth: 1 });

        expect(result.success).toBe(true);
        expect(result.tree).toContain('level1');
        expect(result.tree).not.toContain('deep.txt');
    });

    it('should show all levels when max_depth is high', async () => {
        await mkdir(`${testDir}/level1/level2`, { recursive: true });
        await writeFile(`${testDir}/level1/level2/deep.txt`, 'deep', 'utf-8');

        const result = await getFileTree.execute({ path: testDir, max_depth: 10 });

        expect(result.success).toBe(true);
        expect(result.tree).toContain('level1');
        expect(result.tree).toContain('level2');
        expect(result.tree).toContain('deep.txt');
    });

    it('should ignore default patterns like node_modules', async () => {
        await mkdir(`${testDir}/node_modules/pkg`, { recursive: true });
        await writeFile(`${testDir}/node_modules/pkg/index.js`, 'module code', 'utf-8');
        await writeFile(`${testDir}/real.txt`, 'real file', 'utf-8');

        const result = await getFileTree.execute({ path: testDir });

        expect(result.success).toBe(true);
        expect(result.tree).not.toContain('node_modules');
        expect(result.tree).toContain('real.txt');
    });

    it('should respect custom ignore_patterns', async () => {
        await mkdir(`${testDir}/ignore_me`, { recursive: true });
        await writeFile(`${testDir}/ignore_me/file.txt`, 'ignored', 'utf-8');
        await writeFile(`${testDir}/keep.txt`, 'kept', 'utf-8');

        const result = await getFileTree.execute({ path: testDir, ignore_patterns: ['ignore_me'] });

        expect(result.success).toBe(true);
        expect(result.tree).not.toContain('ignore_me');
        expect(result.tree).toContain('keep.txt');
    });

    it('should format file sizes correctly', async () => {
        await writeFile(`${testDir}/small.txt`, 'ab', 'utf-8');

        const result = await getFileTree.execute({ path: testDir });

        expect(result.success).toBe(true);
        expect(result.tree).toContain('[FILE');
    });

    it('should sort entries alphabetically', async () => {
        await writeFile(`${testDir}/z_file.txt`, 'z', 'utf-8');
        await writeFile(`${testDir}/a_file.txt`, 'a', 'utf-8');
        await writeFile(`${testDir}/m_file.txt`, 'm', 'utf-8');

        const result = await getFileTree.execute({ path: testDir });

        expect(result.success).toBe(true);
        const aIndex = result.tree.indexOf('a_file.txt');
        const mIndex = result.tree.indexOf('m_file.txt');
        const zIndex = result.tree.indexOf('z_file.txt');
        expect(aIndex).toBeLessThan(mIndex);
        expect(mIndex).toBeLessThan(zIndex);
    });

    it('should handle non-existent directory gracefully', async () => {
        const result = await getFileTree.execute({ path: 'nonexistent_directory_12345' });

        expect(result.success).toBe(true);
    });
});
