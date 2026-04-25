import { describe, it, expect } from 'vitest';
import { searchWeb } from './searchWeb.js';

describe('searchWeb', () => {
    it('should return results when SEARXNG is configured', async () => {
        const searxngUrl = process.env.SEARXNG_URL;
        if (!searxngUrl) {
            expect(true).toBe(true);
            return;
        }

        const result = await searchWeb.execute({ query: 'test query' });

        expect(result.success).toBe(true);
        if (result.results.length > 0) {
            expect(result.results[0]).toHaveProperty('title');
            expect(result.results[0]).toHaveProperty('url');
            expect(result.results[0]).toHaveProperty('content');
        }
    }, 15000);

    it('should return success=true even with no results', async () => {
        const searxngUrl = process.env.SEARXNG_URL;
        if (!searxngUrl) {
            expect(true).toBe(true);
            return;
        }

        const result = await searchWeb.execute({ query: 'xyznonexistentquery12345abc' });

        expect(result.success).toBe(true);
    }, 15000);

    it('should handle special characters in query', async () => {
        const searxngUrl = process.env.SEARXNG_URL;
        if (!searxngUrl) {
            expect(true).toBe(true);
            return;
        }

        const result = await searchWeb.execute({ query: 'test & search "quotes"' });

        expect(result.success).toBe(true);
    }, 15000);
});
