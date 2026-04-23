import { SEARXNG_URL } from '../constants.js';

export async function fetchUrl(url: string): Promise<string> {
    try {
        const res = await fetch(url);
        if (!res.ok) return `Error: ${res.status}`;
        const text = await res.text();
        return text.length > 10000 ? text.substring(0, 10000) + "\n... (truncated)" : text;
    } catch (error: any) { return `Error fetching URL "${url}": ${error.message}`; }
}

export async function searchWeb(query: string): Promise<string> {
    try {
        const url = new URL(`${SEARXNG_URL}/search`);
        url.searchParams.append('q', query);
        url.searchParams.append('format', 'json');
        const res = await fetch(url.toString());
        const data = await res.json();
        if (!data.results?.length) return "No results found.";
        return data.results.slice(0, 5).map((r: any) => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}\n`).join('\n---\n');
    } catch (error: any) { return `Error: ${error.message}`; }
}
