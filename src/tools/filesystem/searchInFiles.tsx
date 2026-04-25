import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

const execAsync = promisify(exec);

interface SearchInFilesArgs {
  pattern: string;
  path?: string;
}

type SearchInFilesResult = { success: boolean; matches: string[]; truncated: boolean };

export const searchInFiles: Tool<SearchInFilesArgs, SearchInFilesResult> = {
  name: "search_in_files",
  description: "Search for a pattern in the codebase using grep.",
  schema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "The regex pattern or string to search for." },
      path: { type: "string", description: "The directory or file to search in." }
    },
    required: ["pattern"]
  } as const,
  execute: async ({ pattern, path: searchPath = '.' }: SearchInFilesArgs, _ctx?: ToolCallContext): Promise<SearchInFilesResult> => {
    try {
      const { stdout } = await execAsync(`grep -rnE "${pattern}" ${searchPath}`);
      if (!stdout.trim()) return { success: true, matches: [], truncated : false};
      const lines = stdout.trim().split('\n');
      const truncated = lines.length > 50;
      return { success: true, matches: truncated ? lines.slice(0, 50) : lines, truncated };
    } catch (error: any) {
      if( error.code == 1 ) {
        // error code of 1 means no matches were found.
        return { success: true, matches: [], truncated : false };
      } else {
        return { success: false, matches: [], truncated : false };
      }
    }
  },
  renderCall: ({ pattern, path: searchPath }: SearchInFilesArgs) => (
    <Text color="cyan">grep -rnE "{pattern}" {searchPath || '.'}</Text>
  ),
  renderResult: (result: SearchInFilesResult) => (
    <Text color="gray">
      {result.success && result.matches.length > 0
        ? `${result.matches.length} matches found${result.truncated ? ' (truncated)' : ''}\n${result.matches.join('\n')}`
        : result.success ? 'No matches found.' : `Search failed.`}
    </Text>
  )
};
