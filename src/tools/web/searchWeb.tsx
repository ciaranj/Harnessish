import { SEARXNG_URL } from '../../constants.js';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

interface SearchWebArgs {
  query: string;
}

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

type SearchWebResult = { success: boolean; results: SearchResult[] };

export const searchWeb: Tool<SearchWebArgs, SearchWebResult> = {
  name: "search_web",
  description: "Search the web using SearXNG.",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" }
    },
    required: ["query"]
  } as const,
  execute: async ({ query }: SearchWebArgs, _ctx?: ToolCallContext): Promise<SearchWebResult> => {
    try {
      const url = new URL(`${SEARXNG_URL}/search`);
      url.searchParams.append('q', query);
      url.searchParams.append('format', 'json');
      const res = await fetch(url.toString());
      const data = await res.json();
      if (!data.results?.length) return { success: true, results: [] };
      const formattedResults: SearchResult[] = data.results.slice(0, 5).map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content || ''
      }));
      return { success: true, results: formattedResults };
    } catch (error: any) {
      return { success: false, results: [] };
    }
  },
  renderCall: ({ query }: SearchWebArgs) => (
    <Text color="cyan">search: "{query}"</Text>
  ),
  renderResult: (result: SearchWebResult) => (
    <Text color="gray">
      {result.success && result.results.length > 0
        ? result.results.map((r: SearchResult, i: number) => `${i + 1}. ${r.title} (${r.url})`).join('\n')
        : result.success ? 'No results found.' : `Search failed: ${result.results}`}
    </Text>
  )
};
