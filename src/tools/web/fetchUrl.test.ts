import { describe, it, expect } from 'vitest';
import { fetchUrl } from './fetchUrl.js';

describe('fetchUrl', () => {
    it('should fetch a valid URL and return content', async () => {
        const result = await fetchUrl.execute({ url: 'https://httpbin.org/get' });

        expect(result.success).toBe(true);
        expect(typeof result.content).toBe('string');
        expect(result.status).toBe(200);
    }, 15000);

    it('should return success=false for invalid URL', async () => {
        const result = await fetchUrl.execute({ url: 'https://thisdomaindoesnotexist12345.com' });

        expect(result.success).toBe(false);
        expect(result.status).toBe(0);
        expect(typeof result.content).toBe('string');
    }, 15000);

    it('should return content length info', async () => {
        const result = await fetchUrl.execute({ url: 'https://httpbin.org/get' });

        if (result.success) {
            expect(result.content.length).toBeGreaterThan(0);
        }
    }, 15000);

    it('should truncate very large responses', async () => {
        const result = await fetchUrl.execute({ url: 'https://httpbin.org/bytes/20000' });

        if (result.success) {
            expect(result.content.length).toBeLessThan(20000);
        }
    }, 15000);

    // --- renderCallText tests ---

    it('renderCallText should show "Fetching" with the URL', () => {
        const text = fetchUrl.renderCallText({ url: 'https://example.com' });
        expect(text).toBe('Fetching https://example.com');
    });

    it('renderCallText should handle URLs with paths and query strings', () => {
        const text = fetchUrl.renderCallText({ url: 'https://api.example.com/data?key=value' });
        expect(text).toBe('Fetching https://api.example.com/data?key=value');
    });

    it('renderCallText should handle empty URL', () => {
        const text = fetchUrl.renderCallText({ url: '' });
        expect(text).toBe('Fetching ');
    });
});
