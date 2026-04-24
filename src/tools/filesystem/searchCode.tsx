import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

const execAsync = promisify(exec);

interface SearchCodeArgs {
  pattern: string;
  path?: string;
}

type SearchCodeResult = { success: boolean; matches: string[] };

export const searchCode: Tool<SearchCodeArgs, SearchCodeResult> = {
  name: "search_code",
  description: "Search for a pattern in the codebase using grep.",
  schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "The regex pattern or string to search for." },
      path: { type: "string", description: "The directory or file to search in." }
    },
    required: ["pattern"]
  } as const,
  execute: async ({ pattern, path: searchPath = '.' }: SearchCodeArgs, _ctx?: ToolCallContext): Promise<SearchCodeResult> => {
    try {
      const { stdout } = await execAsync(`grep -rnE "${pattern}" ${searchPath}`);
      if (!stdout.trim()) return { success: true, matches: [] };
      const lines = stdout.trim().split('\n');
      return { success: true, matches: lines.length > 50 ? lines.slice(0, 50) : lines };
    } catch (error: any) {
      return { success: false, matches: [] };
    }
  },
  renderCall: ({ pattern, path: searchPath }: SearchCodeArgs) => (
    <Text color="cyan">grep -rnE "{pattern}" {searchPath || '.'}</Text>
  ),
  renderResult: (result: SearchCodeResult) => (
    <Text color="gray">
      {result.success && result.matches.length > 0
        ? `${result.matches.length} matches found\n${result.matches.join('\n')}`
        : result.success ? 'No matches found.' : `Search failed.`}
    </Text>
  )
};
