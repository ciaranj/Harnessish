import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import React from 'react';
import { Text } from 'ink';
import { Tool, ToolCallContext } from '../types.js';

const execAsyncLarge = (cmd: string) => promisify(exec)(cmd, { maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer

interface SearchInFilesArgs {
  pattern: string;
  path?: string;
}

type SearchInFilesResult = { success: boolean; matches: string[]; truncated: boolean };

// LLM-friendly output limits: cap per-file matches, total output lines, and line length to avoid context window bloat.
const MAX_MATCHES_PER_FILE = 5;
const MAX_TOTAL_OUTPUT_LINES = 30; // includes headers, blank lines, and match content
const MAX_LINE_LENGTH = 200; // truncate individual match lines beyond this

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
      const { stdout, stderr } = await execAsyncLarge(`grep -rnE --no-messages "${pattern}" ${searchPath}`);
      if (!stdout.trim()) return { success: true, matches: [], truncated: false };

      const rawLines = stdout.trim().split('\n');
      const totalMatches = rawLines.length;

      // Group by file (grep format: "filepath:linenum:content")
      const fileGroups = new Map<string, string[]>();
      for (const line of rawLines) {
        const firstColon = line.indexOf(':');
        if (firstColon === -1) continue;
        const filePath = line.substring(0, firstColon);
        const rest = line.substring(firstColon + 1); // "linenum:content"
        if (!fileGroups.has(filePath)) fileGroups.set(filePath, []);
        fileGroups.get(filePath)!.push(rest);
      }

      // Build capped, grouped output
      const outputLines: string[] = [];
      let totalOutputLines = 0;
      let anyTruncated = false;

      // Summary header
      const summary = `Found ${totalMatches} matches across ${fileGroups.size} files.`;
      outputLines.push(summary);
      outputLines.push('');
      totalOutputLines += 2;

      for (const [filePath, fileMatches] of fileGroups) {
        if (totalOutputLines >= MAX_TOTAL_OUTPUT_LINES) break;

        const capped = fileMatches.slice(0, MAX_MATCHES_PER_FILE);
        if (fileMatches.length > MAX_MATCHES_PER_FILE) anyTruncated = true;

        const matchLabel = fileMatches.length === 1 ? 'match' : 'matches';
        outputLines.push(`${filePath} (${fileMatches.length} ${matchLabel})`);
        totalOutputLines++;

        for (const match of capped) {
          if (totalOutputLines >= MAX_TOTAL_OUTPUT_LINES) break;
          const display = match.length > MAX_LINE_LENGTH ? `${match.substring(0, MAX_LINE_LENGTH)}[...]` : match;
          outputLines.push(`  ${display}`);
          totalOutputLines++;
        }

        outputLines.push(''); // blank line between files
        totalOutputLines++;
      }

      const truncated = anyTruncated || rawLines.length > MAX_TOTAL_OUTPUT_LINES;

      return { success: true, matches: outputLines, truncated };
    } catch (error: any) {
      if (error.code === 1) {
        // exit code 1 means no matches found.
        return { success: true, matches: [], truncated: false };
      } else if (error.code === 2 && error.stdout && error.stdout.trim()) {
        // exit code 2 with stdout means grep found matches but also hit errors (e.g., missing dirs).
        const rawLines = error.stdout.trim().split('\n');
        const totalMatches = rawLines.length;

        const fileGroups = new Map<string, string[]>();
        for (const line of rawLines) {
          const firstColon = line.indexOf(':');
          if (firstColon === -1) continue;
          const filePath = line.substring(0, firstColon);
          const rest = line.substring(firstColon + 1);
          if (!fileGroups.has(filePath)) fileGroups.set(filePath, []);
          fileGroups.get(filePath)!.push(rest);
        }

        const outputLines: string[] = [];
        let totalOutputLines = 0;
        let anyTruncated = false;

        const summary = `Found ${totalMatches} matches across ${fileGroups.size} files.`;
        outputLines.push(summary);
        outputLines.push('');
        totalOutputLines += 2;

        for (const [filePath, fileMatches] of fileGroups) {
          if (totalOutputLines >= MAX_TOTAL_OUTPUT_LINES) break;
          const capped = fileMatches.slice(0, MAX_MATCHES_PER_FILE);
          if (fileMatches.length > MAX_MATCHES_PER_FILE) anyTruncated = true;

          const matchLabel = fileMatches.length === 1 ? 'match' : 'matches';
          outputLines.push(`${filePath} (${fileMatches.length} ${matchLabel})`);
          totalOutputLines++;

          for (const match of capped) {
            if (totalOutputLines >= MAX_TOTAL_OUTPUT_LINES) break;
            const display = match.length > MAX_LINE_LENGTH ? `${match.substring(0, MAX_LINE_LENGTH)}[...]` : match;
          outputLines.push(`  ${display}`);
            totalOutputLines++;
          }
          outputLines.push('');
          totalOutputLines++;
        }

        const truncated = anyTruncated || rawLines.length > MAX_TOTAL_OUTPUT_LINES;
        return { success: true, matches: outputLines, truncated };
      } else {
        return { success: false, matches: [], truncated: false };
      }
    }
  },
  renderCall: ({ pattern, path: searchPath }: SearchInFilesArgs) => (
    <Text color="cyan">grep -rnE "{pattern}" {searchPath || '.'}</Text>
  ),
  renderResult: (result: SearchInFilesResult) => (
    <Text color="gray">
      {result.success && result.matches.length > 0
        ? `${result.matches.join('\n')}${result.truncated ? '\n(truncated)' : ''}`
        : result.success ? 'No matches found.' : `Search failed.`}
    </Text>
  )
};
