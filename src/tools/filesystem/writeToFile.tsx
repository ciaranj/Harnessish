import { writeFile, appendFile } from 'node:fs/promises';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

interface WriteToFileArgs {
  path: string;
  content: string;
  mode?: "overwrite" | "append";
}

type WriteToFileResult = { success: boolean; message: string };

export const writeToFile: Tool<WriteToFileArgs, WriteToFileResult> = {
  name: "write_to_file",
  description: "Creates a new file or overwrites an existing file with the provided content. Use mode='append' to append to an existing file.",
  schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "The path to the file to write." },
      content: { type: "string", description: "The full content to write into the file." },
      mode: { type: "string", enum: ["overwrite", "append"], description: "Whether to overwrite or append to an existing file. Default is 'overwrite'.", default: "overwrite" }
    },
    required: ["path", "content"]
  } as const,
  execute: async ({ path: p, content, mode = 'overwrite' }: WriteToFileArgs, _ctx?: ToolCallContext): Promise<WriteToFileResult> => {
    try {
      if (mode === 'append') {
        await appendFile(p, content, 'utf-8');
        return { success: true, message: `Successfully appended to ${p}` };
      }
      await writeFile(p, content, 'utf-8');
      return { success: true, message: `Successfully wrote to ${p}` };
    } catch (error: any) {
      return { success: false, message: `Error writing to file at "${p}": ${error.message}` };
    }
  },
  renderCall: ({ path: p, content, mode }: WriteToFileArgs) => (
    <Text color="cyan">{mode || 'overwrite'} → {p} ({content.length} bytes)</Text>
  ),
  renderResult: (result: WriteToFileResult) => (
    <Text color={result.success ? "green" : "red"}>{result.message}</Text>
  )
};
