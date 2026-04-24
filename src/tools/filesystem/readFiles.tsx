import { readFile } from 'node:fs/promises';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

interface ReadFilesArgs {
  paths: string[];
}

interface FileReadResult {
  path: string;
  success: boolean;
  content?: string;
  error?: string;
}

export const readFiles: Tool<ReadFilesArgs, FileReadResult[]> = {
  name: "read_files",
  description: "Read the contents of one or more files and return them in a single call.",
  schema: {
    type: "object",
    properties: {
      paths: { type: "array", items: { type: "string" }, description: "List of file paths to read." }
    },
    required: ["paths"]
  } as const,
  execute: async ({ paths }: ReadFilesArgs, _ctx?: ToolCallContext): Promise<FileReadResult[]> => {
    if (paths.length === 0) return [];
    const results: FileReadResult[] = [];
    for (const p of paths) {
      try {
        const content = await readFile(p, 'utf-8');
        results.push({ path: p, success: true, content });
      } catch (error: any) {
        results.push({ path: p, success: false, error: error.message });
      }
    }
    return results;
  },
  renderCall: ({ paths }: ReadFilesArgs) => (
    <Text color="cyan">Reading files: {paths.join(", ")}</Text>
  ),
  renderResult: (results: FileReadResult[]) => (
    <Text color="gray">
      {results.map((r: FileReadResult) => 
        r.success 
          ? `${r.path}: OK (${r.content?.length || 0} bytes)` 
          : `${r.path}: FAILED (${r.error})`
      ).join("\n")}
    </Text>
  )
};
