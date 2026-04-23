import React from 'react';
import { render } from 'ink';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

import { StringDecoder } from 'node:string_decoder';
import { readFile, writeFile, readdir, appendFile} from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Message, Stats } from './types.js';
import { OLLAMA_CHAT_URL, SEARXNG_URL, systemPrompt } from './constants.js';
import { App } from './ui.js';
import { buildLLMPayload } from './utils.js';

const execAsync = promisify(exec);

async function getGitDiff(path = '', staged = false) {
    try {
        const flag = staged ? '--cached' : '';
        const command = `git diff ${flag} ${path}`.trim();
        const { stdout } = await execAsync(command);
        return stdout.trim() || "No changes detected in the specified scope.";
    } catch (error: any) {
        return error.stdout || `Error running git diff: ${error.message}`;
    }
}

function runPython(code: string, timeoutMs = 60_000) {
    return new Promise((resolve) => {
        const proc = spawn('ipython', ['--no-banner', '--no-confirm-exit', '-c', code], { timeout: timeoutMs });
        let stdout = '', stderr = '';
        proc.stdout.on('data', (d) => { stdout += d; });
        proc.stderr.on('data', (d) => { stderr += d; });
        proc.on('close', (code) => {
            if (code !== 0 && stderr) resolve(`Error:\n${stderr.trim()}`);
            else resolve(stdout.trim() || '(no output)');
        });
        proc.on('error', (e) => resolve(`Failed to launch ipython: ${e.message}`));
    });
}

async function readLocalFile(path: string): Promise<string> {
    try { return await readFile(path, 'utf-8'); }
    catch (error: any) { return `Error reading file at "${path}": ${error.message}`; }
}

async function writeLocalFile(path: string, content: string): Promise<string> {
    try { await writeFile(path, content, 'utf-8'); return `Successfully wrote to ${path}`; }
    catch (error: any) { return `Error writing to file at "${path}": ${error.message}`; }
}

async function fetchUrl(url: string): Promise<string> {
    try {
        const res = await fetch(url);
        if (!res.ok) return `Error: ${res.status}`;
        const text = await res.text();
        return text.length > 10000 ? text.substring(0, 10000) + "\n... (truncated)" : text;
    } catch (error: any) { return `Error fetching URL "${url}": ${error.message}`; }
}

async function searchWeb(query: string): Promise<string> {
    try {
        const url = new URL(`${SEARXNG_URL}/search`);
        url.searchParams.append('q', query);
        url.searchParams.append('format', 'json');
        const res = await fetch(url.toString());
        const data = await res.json();
        if (!data.results?.length) return "No results found.";
        return data.results.slice(0, 5).map((r: any) => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}\n`).join('\n---\n');
    } catch (error: any) { return `Error: ${error.message}`; }
}

async function searchCode(pattern: string, path: string = '.'): Promise<string> {
    try {
        const { stdout } = await execAsync(`grep -rnE "${pattern}" ${path}`);
        if (!stdout.trim()) return `No matches found for "${pattern}" in "${path}".`;
        const lines = stdout.trim().split('\n');
        return lines.length > 50 ? `Found ${lines.length} matches. Showing first 50:\n${lines.slice(0, 50).join('\n')}\n...` : stdout.trim();
    } catch (error: any) { return `Error: ${error.message}`; }
}

async function listDirectory(dirPath: string): Promise<string> {
    try {
        const files = await readdir(dirPath, { withFileTypes: true });
        return files.map(f => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n') || "Empty.";
    } catch (error: any) { return `Error: ${error.message}`; }
}

async function replaceContentLocal(path: string, searchString: string, replacementString: string): Promise<string> {
    try {
        const content = await readFile(path, 'utf-8');
        if (!content.includes(searchString)) return `Error: Search string not found in "${path}".`;
        await writeFile(path, content.replace(searchString, replacementString), 'utf-8');
        return `Successfully replaced content in ${path}`;
    } catch (error: any) { return `Error: ${error.message}`; }
}

async function appendLocalFile(path: string, content: string): Promise<string> {
    try { await appendFile(path, content, 'utf-8'); return `Successfully appended to ${path}`; }
    catch (error: any) { return `Error: ${error.message}`; }
}

async function getFileTree(dirPath: string, maxDepth: number = 3, ignorePatterns: string[] = ['node_modules', '.git', 'build', 'dist']): Promise<string> {
    try {
        async function build(p: string, currentDepth: number, indent = ""): Promise<string> {
            if (currentDepth > maxDepth) return "";
            let entries;
            try {
                entries = await readdir(p, { withFileTypes: true });
            } catch (e: any) { return `${indent}[DIR] ${path.basename(p)} (Permission Denied)\n`; }

            let tree = "";
            const sortedEntries = entries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });

            for (const e of sortedEntries) {
                if (ignorePatterns.some(pattern => e.name === pattern || e.name.startsWith(pattern + '/'))) {
                    continue;
                }
                const fp = path.join(p, e.name);
                tree += `${indent}${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}\n`;
                if (e.isDirectory()) {
                    tree += await build(fp, currentDepth + 1, indent + "  ");
                }
            }
            return tree;
        }
        return await build(dirPath, 0);
    } catch (error: any) { return `Error: ${error.message}`; }
}

async function grepFile(filePath: string, pattern: string): Promise<string> {
    try {
        const { stdout } = await execAsync(`grep -nE "${pattern}" "${filePath}"`);
        if (!stdout.trim()) return `No matches found for "${pattern}" in "${filePath}".`;
        return stdout.trim();
    } catch (error: any) {
        return error.stdout || `Error: ${error.message}`;
    }
}

async function findFile(pattern:string, startPath:string = '.' ) {
    const results:string[] = [];

    const globToRegex = (glob:string) => {
        let regexStr = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        regexStr = regexStr.replace(/\*/g, '.*');
        regexStr = regexStr.replace(/\?/g, '.');
        return new RegExp(`^${regexStr}$`);
    };

    const patternRegex = globToRegex(pattern);

    async function walk(currentDir:string) {
        try {
            const entries = await readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    await walk(fullPath);
                } else if (entry.isFile()) {
                    if (patternRegex.test(entry.name)) {
                        results.push(fullPath);
                    }
                }
            }
        } catch (error:any) {
            console.error(`Error reading directory ${currentDir}: ${error.message}`);
        }
    }

    const absoluteStartPath = path.resolve(startPath);
    await walk(absoluteStartPath);
    return results;
}

// --- MCP Client ---

let mcpClient = new Client({ name: "mcp-client-cli", version: "1.0.0" });
let mcpTransport: StreamableHTTPClientTransport | null = null;

async function connectToServer() {
    try {
        mcpTransport = new StreamableHTTPClientTransport(new URL("https://seolinkmap.com/mcp"));
        await mcpClient.connect(mcpTransport);
        return true;
    } catch (e) { return false; }
}

async function dispatchTool(name: string, args: any) {
    if (name === 'python') return runPython(args.code);
    if (name === 'read_from_file') return await readLocalFile(args.path);
    if (name === 'get_git_diff') return await getGitDiff(args.path, args.staged);
    if (name === 'write_to_file') return await writeLocalFile(args.path, args.content);
    if (name === 'replace_content') return await replaceContentLocal(args.path, args.search_string, args.replacement_string);
    if (name === 'append_to_file') return await appendLocalFile(args.path, args.content);
    if (name === 'get_file_tree') return await getFileTree(args.path, args.max_depth, args.ignore_patterns);
    if (name === 'grep_file') return await grepFile(args.path, args.pattern);
    if (name === 'find_file') return await findFile(args.pattern, args.path);
    if (name === 'search_web') return await searchWeb(args.query);
    if (name === 'fetch_url') return await fetchUrl(args.url);
    if (name === 'search_code') return await searchCode(args.pattern, args.path);
    if (name === 'list_directory') return await listDirectory(args.path);
    const result = await mcpClient.callTool({ name, arguments: args });
    return JSON.stringify(result.content);
}

// --- LLM Core ---

async function makeCallToLLM(
    message: string | undefined,
    updateMessages: (updateFn: (msgs: Message[]) => Message[]) => void,
    messagesRef: React.MutableRefObject<Message[]>,
    tools: any[],
    setStats: React.Dispatch<React.SetStateAction<Stats>>,
    depth: number = 0,
    signal?: AbortSignal
) {
    if (depth > 100) throw new Error("Too many loops");
    if (message) updateMessages(msgs => [...msgs, { role: 'user', content: message }]);
    
    setStats(prev => ({ ...prev, tokens: 0, tps: 0, status: 'idle' }));

    const startTime = Date.now();
    let tokenCount = 0;

    const payload = buildLLMPayload(messagesRef.current, tools);
    const body = JSON.stringify(payload);

    const res = await fetch(`${OLLAMA_CHAT_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        signal
    });

    if (res.status !== 200) throw new Error(`LLM error: ${res.status}`);

    let buffer = "";
    const decoder = new StringDecoder('utf8');
    let response = "";
    const toolCalls: any[] = [];

    if (!res.body) throw new Error("No response body");

    try {
        for await (const chunk of res.body) {
            if (signal?.aborted) throw new Error("Aborted");
            buffer += decoder.write(chunk);
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.trim()) continue;
                const data = line.startsWith('data: ') ? line.slice(6) : line;
                if (data === '[DONE]') break;

                const payload = JSON.parse(data);
                if( payload.timings && payload.timings.prompt_n !== undefined ) {
                    setStats(prev => ({ ...prev, contextSize: payload.timings.prompt_n + payload.timings.cache_n, cachedContextSize: payload.timings.cache_n}));
                }
                const delta = payload.choices[0].delta;

                tokenCount++;
                const elapsedSeconds = (Date.now() - startTime) / 1000;
                const tps = elapsedSeconds > 0 ? tokenCount / elapsedSeconds : 0;

                if (delta.reasoning_content) {
                    setStats(prev => ({ ...prev, tokens: tokenCount, tps:0, status: 'thinking' }));
                    const token = delta.reasoning_content;
                    updateMessages(msgs => {
                        const last = msgs[msgs.length - 1];
                        if (last && last.role === 'assistant') return [...msgs.slice(0, -1), { ...last, reasoning_content: (last.reasoning_content || '') + token }];
                        return [...msgs, { role: 'assistant', content: '', reasoning_content: token }];
                    });
                }

                if (delta.tool_calls) {
                    setStats(prev => ({ ...prev, tokens: tokenCount, tps, status: 'tool_calling' }));
                    for (const tc of delta.tool_calls) {
                        if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, type: tc.type, function: { name: tc.function.name, arguments: '' } };
                        toolCalls[tc.index].function.arguments += tc.function.arguments ?? '';
                    }
                }

                if (delta.content) {
                    setStats(prev => ({ ...prev, tokens: tokenCount, tps, status: 'generating' }));
                    const token = delta.content;
                    response += token;
                    updateMessages(msgs => {
                        const last = msgs[msgs.length - 1];
                        if (last && last.role === 'assistant') return [...msgs.slice(0, -1), { ...last, content: last.content + token }];
                        return [...msgs, { role: 'assistant', content: token }];
                    });
                }

                if (payload.choices[0].finish_reason === 'tool_calls') {
                    updateMessages(msgs => {
                        const last = msgs[msgs.length - 1];
                        return [...msgs.slice(0, -1), { ...last, tool_calls: toolCalls }];
                    });
                    
                    setStats(prev => ({ ...prev, status: 'tool_running' }));
                    await appendFile("prompts.txt", "----\n EXECUTING " +  toolCalls.length + " tools: " + JSON.stringify(toolCalls)+ "\n---\n", 'utf-8');

                    for (const tc of toolCalls) {
                        const args = JSON.parse(tc.function.arguments);
                        const result = await dispatchTool(tc.function.name, args);
                        updateMessages(msgs => [...msgs, { role: 'tool', tool_call_id: tc.id, content: String(result) }]);
                    }
                    await makeCallToLLM(undefined, updateMessages, messagesRef, tools, setStats, depth + 1, signal);
                }
            }
        }
    } catch (e) {
        if (signal?.aborted) {
            throw new Error("Aborted");
        }
        throw e;
    }
    setStats(prev => ({ ...prev, status: 'idle' }));
}


// --- Main Entry Point ---

async function main() {
    //await connectToServer();
    render(<App makeCallToLLM={makeCallToLLM} />);
}

main();
