import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

const execAsync = promisify(exec);

interface GrepFileArgs {
  path: string;
  pattern: string;
}

type GrepFileResult = { success: boolean; matches: string[] };

export const grepFile: Tool<GrepFileArgs, GrepFileResult> = {
  name: "grep_file",
  description: "Search for a pattern within a specific file.",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "The path to the file to search in." },
      pattern: { type: "string", description: "The regex pattern or string to search for." }
    },
    required: ["path", "pattern"]
  } as const,
  execute: async ({ path: filePath, pattern }: GrepFileArgs, _ctx?: ToolCallContext): Promise<GrepFileResult> => {
    try {
      const { stdout } = await execAsync(`grep -nE "${pattern}" "${filePath}"`);
      if (!stdout.trim()) return { success: true, matches: [] };
      return { success: true, matches: stdout.trim().split('\n') };
    } catch (error: any) {
      return { success: false, matches: [] };
    }
  },
  renderCall: ({ path: filePath, pattern }: GrepFileArgs) => (
    <Text color="cyan">grep "{pattern}" in {filePath}</Text>
  ),
  renderResult: (result: GrepFileResult) => (
    <Text color="gray">
      {result.success && result.matches.length > 0
        ? `${result.matches.join('\n')}`
        : result.success ? 'No matches found.' : `Search failed.`}
    </Text>
  )
};
