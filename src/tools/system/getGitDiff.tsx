import { spawn } from 'node:child_process';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

interface GetGitDiffArgs {
  path?: string;
  staged?: boolean;
}

type GitDiffResult = { success: boolean; diff: string };

function renderGetGitDiffCall(path?: string, staged?: boolean): string {
  const flag = staged ? '--cached ' : '';
  return `Diffing ${flag}${path || '.'}`;
}

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
    let capturedStderr = '';
    try {
      const args: string[] = ['diff'];
      if (staged) args.push('--cached');
      if (path) args.push(path);
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        const child = spawn('git', args);
        let stdoutParts: string[] = [];
        child.stdout.on('data', (d: Buffer) => stdoutParts.push(d.toString()));
        child.stderr.on('data', (d: Buffer) => { capturedStderr += d.toString(); });
        child.on('close', (code) => {
          // code 0 = changes found, code 1 = no changes (clean), both success
          // code 2 = error (e.g. grep-like), code 128 = fatal (file not found, not a git repo)
          if (code !== 0 && code !== 1) {
            reject(new Error(capturedStderr || `git diff exited with code ${code}`));
          } else {
            resolve({ stdout: stdoutParts.join('') });
          }
        });
        child.on('error', (err) => reject(err));
      });
      return { success: true, diff: stdout.trim() || "No changes detected." };
    } catch (error: any) {
      return { success: false, diff: capturedStderr || `Error running git diff: ${error.message}` };
    }
  },
  renderCall: ({ path, staged }: GetGitDiffArgs) => (
    <Text color="cyan">{renderGetGitDiffCall(path, staged)}</Text>
  ),
  renderCallText: ({ path, staged }: GetGitDiffArgs) =>
    renderGetGitDiffCall(path, staged),
  renderResult: (result: GitDiffResult) => (
    <Text color="gray">{result.diff}</Text>
  )
};
