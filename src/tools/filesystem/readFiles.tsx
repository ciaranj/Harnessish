import { readFile } from 'node:fs/promises';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

interface ReadFileLineRange {
  path: string;
  start: number;
  end: number;
}

interface ReadFilesArgs {
  paths: ReadFileLineRange[];
}

interface FileReadResult {
  path: string;
  success: boolean;
  content?: string;
  error?: string;
  lineCount?: number;
}


export const readFiles: Tool<ReadFilesArgs, FileReadResult[]> = {
  name: "read_files",
  description: "Read the contents of one or more files and return them in a single call.",
  schema: {
    type: "object",
    properties: {
      paths: {
        type: "array",
        items:
            {
              type: "object",
              properties: {
                path: { type: "string", description: "File path." },
                start: { type: "number", description: "Starting line number (1-indexed, inclusive)." },
                end: { type: "number", description: "Ending line number (1-indexed, inclusive)." }
              },
              required: ["path"]
            },
        description: "List of filepaths with optional line ranges to read."
      }
    },
    required: ["paths"]
  } as const,
  execute: async ({ paths }: ReadFilesArgs, _ctx?: ToolCallContext): Promise<FileReadResult[]> => {
    if (paths.length === 0) return [];

    const results: FileReadResult[] = [];
    // Cache per-path content to avoid re-reading the same file multiple times
    const cache = new Map<string, string>();

    for (const entry of paths) {
      if (entry.start === undefined || entry.end === undefined) {
        // Full file read
        try {
          let content = cache.get(entry.path);
          if (content === undefined) {
            content = await readFile(entry.path, 'utf-8');
            cache.set(entry.path, content);
          }
          results.push({ path: entry.path, success: true, content });
        } catch (error: any) {
          results.push({ path: entry.path, success: false, error: error.message });
        }
      } else {
        // Line-range read
        const { path: p, start, end } = entry;
        try {
          let content = cache.get(p);
          if (content === undefined) {
            content = await readFile(p, 'utf-8');
            cache.set(p, content);
          }
          const allLines = content.split('\n');
          const s = Math.max(1, start);
          const e = Math.min(allLines.length, end);
          if (s > e || s > allLines.length) {
            results.push({ path: p, success: false, error: `Line range ${start}-${end} is out of bounds for file with ${allLines.length} lines` });
            continue;
          }
          const excerpt = allLines.slice(s - 1, e).join('\n');
          results.push({ path: p, success: true, content: excerpt, lineCount: e - s + 1 });
        } catch (error: any) {
          results.push({ path: p, success: false, error: error.message });
        }
      }
    }

    return results;
  },
  renderCall: ({ paths }: ReadFilesArgs) => (
    <Text color="cyan">
      {paths.map((p) =>
        typeof p === 'string' ? p : `${p.path}:${p.start}-${p.end}`
      ).join(", ")}
    </Text>
  ),
  renderResult: (results: FileReadResult[]) => (
    <Text color="gray">
      {results.map((r: FileReadResult) =>
        r.success
          ? `${r.path}: OK (${r.lineCount ? `${r.lineCount} lines` : `${r.content?.length || 0} bytes`})`
          : `${r.path}: FAILED (${r.error})`
      ).join("\n")}
    </Text>
  )
};
