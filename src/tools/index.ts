export type { Tool, ToolCallContext, ToolCtx } from './types.js';
export { toolToOpenAITool, toolsToOpenAITools } from './types.js';

import { readFiles } from './filesystem/readFiles.js';
import { writeToFile } from './filesystem/writeToFile.js';
import { replaceContent } from './filesystem/replaceContent.js';
import { getFileTree } from './filesystem/getFileTree.js';
import { getGitDiff } from './system/getGitDiff.js';
import { runPython } from './system/runPython.js';
import { findFile } from './filesystem/findFile.js';
import { searchInFiles } from './filesystem/searchInFiles.js';
import { searchWeb } from './web/searchWeb.js';
import { fetchUrl } from './web/fetchUrl.js';

export const tools = [
  readFiles,
  writeToFile,
  replaceContent,
  getFileTree,
  getGitDiff,
  runPython,
  findFile,
  searchInFiles,
  searchWeb,
  fetchUrl
] as const;

export const toolsByName = Object.fromEntries(tools.map(t => [t.name, t])) as Record<string, typeof tools[number]>;

export { readFiles, writeToFile, replaceContent, getFileTree, getGitDiff, runPython, findFile, searchInFiles, searchWeb, fetchUrl };
