import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { replaceContent } from './replaceContent.js';
import { writeFile, unlink, readFile } from 'node:fs/promises';

describe('replaceContent', () => {
    const testFiles: string[] = [];

    beforeEach(async () => {
        process.env.MODEL = 'test-model';
    });

    afterEach(async () => {
        for (const file of testFiles) {
            try { await unlink(file); } catch { /* ignore */ }
        }
    });

    it('should replace a single occurrence by default', async () => {
        const testPath = 'test_replace_single.txt';
        testFiles.push(testPath);
        await writeFile(testPath, 'foo bar foo', 'utf-8');

        const result = await replaceContent.execute({ path: testPath, search_string: 'foo', replacement_string: 'baz' });

        expect(result.success).toBe(true);
        expect(result.message).toContain('1 occurrence');
        const content = await readFile(testPath, 'utf-8');
        expect(content).toBe('baz bar foo');
    });

    it('should replace all occurrences when replace_all=true', async () => {
        const testPath = 'test_replace_all.txt';
        testFiles.push(testPath);
        await writeFile(testPath, 'aaa bbb aaa', 'utf-8');

        const result = await replaceContent.execute({ path: testPath, search_string: 'aaa', replacement_string: 'ccc', replace_all: true });

        expect(result.success).toBe(true);
        expect(result.message).toContain('2 occurrence(s)');
        const content = await readFile(testPath, 'utf-8');
        expect(content).toBe('ccc bbb ccc');
    });

    it('should return error when search_string not found (literal mode)', async () => {
        const testPath = 'test_replace_notfound.txt';
        testFiles.push(testPath);
        await writeFile(testPath, 'hello world', 'utf-8');

        const result = await replaceContent.execute({ path: testPath, search_string: 'notpresent', replacement_string: 'replaced' });

        expect(result.success).toBe(false);
        expect(result.message).toContain('not found');
    });

    it('should replace only the first match when use_regex=true and replace_all=false which is the default for replace_all', async () => {
        const testPath = 'test_replace_regex.txt';
        testFiles.push(testPath);
        await writeFile(testPath, 'abc123def456ghi', 'utf-8');

        const result = await replaceContent.execute({ path: testPath, search_string: '\\d+', replacement_string: 'NUM', use_regex: true });

        expect(result.success).toBe(true);
        const content = await readFile(testPath, 'utf-8');
        expect(content).toBe('abcNUMdef456ghi');
    });

    it('should replace all matches when use_regex=true and replace_all=true', async () => {
        const testPath = 'test_replace_regex_all.txt';
        testFiles.push(testPath);
        await writeFile(testPath, 'abc123def456ghi', 'utf-8');

        const result = await replaceContent.execute({ path: testPath, search_string: '\\d+', replacement_string: 'NUM', use_regex: true, replace_all: true });

        expect(result.success).toBe(true);
        const content = await readFile(testPath, 'utf-8');
        expect(content).toBe('abcNUMdefNUMghi');
    });

    it('should return error when regex pattern not found', async () => {
        const testPath = 'test_replace_regex_notfound.txt';
        testFiles.push(testPath);
        await writeFile(testPath, 'hello world', 'utf-8');

        const result = await replaceContent.execute({ path: testPath, search_string: '\\d+', replacement_string: 'NUM', use_regex: true });

        expect(result.success).toBe(false);
        expect(result.message).toContain('not found');
    });

    it('should handle multi-line content replacement', async () => {
        const testPath = 'test_replace_multiline.txt';
        testFiles.push(testPath);
        await writeFile(testPath, 'line1\nline2\nline3', 'utf-8');

        const result = await replaceContent.execute({ path: testPath, search_string: 'line2', replacement_string: 'replaced' });

        expect(result.success).toBe(true);
        const content = await readFile(testPath, 'utf-8');
        expect(content).toBe('line1\nreplaced\nline3');
    });

    it('should return error for non-existent file', async () => {
        const result = await replaceContent.execute({ path: 'nonexistent.txt', search_string: 'old', replacement_string: 'new' });

        expect(result.success).toBe(false);
        expect(result.message).toContain('Error');
    });

    it('should handle special characters in search and replacement', async () => {
        const testPath = 'test_replace_special.txt';
        testFiles.push(testPath);
        await writeFile(testPath, '$HOME/path', 'utf-8');

        const result = await replaceContent.execute({ path: testPath, search_string: '$HOME', replacement_string: '/home/user' });

        expect(result.success).toBe(true);
        const content = await readFile(testPath, 'utf-8');
        expect(content).toBe('/home/user/path');
    });

    it('should handle regex with special characters when use_regex=true', async () => {
        const testPath = 'test_replace_regex_special.txt';
        testFiles.push(testPath);
        await writeFile(testPath, '<div class="test">content</div>', 'utf-8');

        const result = await replaceContent.execute({ path: testPath, search_string: '<div[^>]*>', replacement_string: '<section>', use_regex: true });

        expect(result.success).toBe(true);
        const content = await readFile(testPath, 'utf-8');
        expect(content).toBe('<section>content</div>');
    });
});
