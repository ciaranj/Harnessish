import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

interface FetchUrlArgs {
  url: string;
}

type FetchUrlResult = { success: boolean; content: string; status: number };

export const fetchUrl: Tool<FetchUrlArgs, FetchUrlResult> = {
  name: "fetch_url",
  description: "Fetches the content of a URL and returns it as text.",
  schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch." }
    },
    required: ["url"]
  } as const,
  execute: async ({ url }: FetchUrlArgs, _ctx?: ToolCallContext): Promise<FetchUrlResult> => {
    try {
      const res = await fetch(url);
      const text = await res.text();
      const truncated = text.length > 10000 ? text.substring(0, 10000) + "\n... (truncated)" : text;
      return { success: res.ok, content: truncated, status: res.status };
    } catch (error: any) {
      return { success: false, content: `Error fetching URL "${url}": ${error.message}`, status: 0 };
    }
  },
  renderCall: ({ url }: FetchUrlArgs) => (
    <Text color="cyan">fetching: {url}</Text>
  ),
  renderResult: (result: FetchUrlResult) => (
    <Text color={result.success ? "green" : "red"}>
      {result.status === 0 ? result.content : `HTTP ${result.status} (${result.content.length} bytes)`}
    </Text>
  )
};
