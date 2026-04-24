import { spawn } from 'node:child_process';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

interface RunPythonArgs {
  code: string;
}

type PythonResult = { success: boolean; output: string };

export const runPython: Tool<RunPythonArgs, PythonResult> = {
  name: "python",
  description: "Runs code in an ipython interpreter and returns the result.",
  schema: {
    type: "object",
    properties: {
      code: { type: "string", description: "The code to run in the ipython interpreter." }
    },
    required: ["code"]
  } as const,
  execute: async ({ code }: RunPythonArgs, _ctx?: ToolCallContext): Promise<PythonResult> => {
    return new Promise((resolve) => {
      const proc = spawn('ipython', ['--no-banner', '--no-confirm-exit', '-c', code], { timeout: 60_000 });
      let stdout = '', stderr = '';
      proc.stdout.on('data', (d) => { stdout += d; });
      proc.stderr.on('data', (d) => { stderr += d; });
      proc.on('close', (code) => {
        if (code !== 0 && stderr) resolve({ success: false, output: stderr.trim() });
        else resolve({ success: true, output: stdout.trim() || '(no output)' });
      });
      proc.on('error', (e) => resolve({ success: false, output: `Failed to launch ipython: ${e.message}` }));
    });
  },
  renderCall: ({ code }: RunPythonArgs) => (
    <Text color="cyan">python -c "{code.slice(0, 60)}{code.length > 60 ? '...' : ''}"</Text>
  ),
  renderResult: (result: PythonResult) => (
    <Text color={result.success ? "green" : "red"}>{result.output}</Text>
  )
};
