import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

const execAsync = promisify(exec);

interface GetGitDiffArgs {
  path?: string;
  staged?: boolean;
}

type GitDiffResult = { success: boolean; diff: string };

export const getGitDiff: Tool<GetGitDiffArgs, GitDiffResult> = {
  name: "get_git_diff",
  description: "Returns the differences between the current working directory and the last commit.",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "The specific file to check the diff for." },
      staged: { type: "boolean", description: "If true, returns staged changes." }
    }
  } as const,
  execute: async ({ path = '', staged = false }: GetGitDiffArgs, _ctx?: ToolCallContext): Promise<GitDiffResult> => {
    try {
      const flag = staged ? '--cached' : '';
      const command = `git diff ${flag} ${path}`.trim();
      const { stdout } = await execAsync(command);
      return { success: true, diff: stdout.trim() || "No changes detected." };
    } catch (error: any) {
      return { success: false, diff: error.stdout || `Error running git diff: ${error.message}` };
    }
  },
  renderCall: ({ path, staged }: GetGitDiffArgs) => (
    <Text color="cyan">git diff {staged ? '--cached ' : ''}{path || '.'}</Text>
  ),
  renderResult: (result: GitDiffResult) => (
    <Text color="gray">{result.diff}</Text>
  )
};
