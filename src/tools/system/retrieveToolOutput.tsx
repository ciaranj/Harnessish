import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';
import { findActiveSessionId } from '../../core/session.js';
import fs from 'node:fs';
import path from 'node:path';

interface RetrieveToolOutputArgs {
  outputId: string;
  description?: string;
}

type RetrieveResult = { success: boolean; content: string };

function renderRetrieveCall(outputId: string, description?: string): string {
  return `Retrieving tool output: ${outputId}` + (description ? ` (${description})` : '');
}

function resolveCompactedToolOutputsPath(): string | null {
  const activeId = findActiveSessionId();
  if (!activeId) return null;

  const outputsDir = path.join('.h', 'sessions', activeId, 'compacted_tool_outputs');
  return fs.existsSync(outputsDir) ? outputsDir : null;
}

export const retrieveToolOutput: Tool<RetrieveToolOutputArgs, RetrieveResult> = {
  name: 'retrieve_tool_output',
  description: 'Retrieve an externalized tool output from the session context. Use this when you need to review a large tool output that was previously externalized. Provide the output ID (e.g., "output-1") from the context reference in the conversation.',
  schema: {
    type: 'object',
    properties: {
      outputId: {
        type: 'string',
        description: 'The output identifier, e.g. "d6541ee4-3402-43e0-b726-36b390a81c32".'
      },
      description: {
        type: 'string',
        description: 'Optional description of what you expect to find.'
      }
    },
    required: ['outputId']
  } as const,
  execute: async ({ outputId, description }: RetrieveToolOutputArgs, _ctx?: ToolCallContext): Promise<RetrieveResult> => {
    const outputsDir = resolveCompactedToolOutputsPath();

    if (!outputsDir) {
      return { success: false, content: `Compacted tool outputs directory not found. No active session or outputs not accessible.` };
    }

    const outputPath = path.join(outputsDir, `${outputId}.txt`);

    if (!fs.existsSync(outputPath)) {
      return { success: false, content: `No tool output found with ID "${outputId}" in session context.` };
    }

    try {
      const content = fs.readFileSync(outputPath, 'utf-8');
      return { success: true, content };
    } catch (err) {
      return { success: false, content: `Failed to read tool output: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
  renderCall: ({ outputId, description }: RetrieveToolOutputArgs) => (
    <Text color="cyan">{renderRetrieveCall(outputId, description)}</Text>
  ),
  renderCallText: ({ outputId, description }: RetrieveToolOutputArgs) =>
    renderRetrieveCall(outputId, description),
  renderResult: (result: RetrieveResult) => (
    <Text color={result.success ? "green" : "red"}>{result.content}</Text>
  )
};
