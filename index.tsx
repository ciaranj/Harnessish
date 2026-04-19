import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render, Text, Box, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

import { loadEnvFile } from 'node:process';
import { StringDecoder } from 'node:string_decoder';
import { readFile, writeFile, readdir, appendFile} from 'node:fs/promises';
import  fs  from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { toolsDefinition } from './tools.js';
const execAsync = promisify(exec);
try { loadEnvFile(); } catch {}

// --- Types ---

type Message = {
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string;
    reasoning?: string;
    tool_calls?: any[];
    tool_call_id?: string;
};

// --- Constants ---

const OLLAMA_HEALTH_URL = new URL('/health', process.env.OLLAMA_URL!);
const OLLAMA_CHAT_URL = new URL('/v1/chat/completions', process.env.OLLAMA_URL!);
const SEARXNG_URL = process.env.SEARXNG_URL;

const systemPrompt = `You may use the available tools when they are needed to answer accurately.
Use a tool when the question requires live data, account-specific data, or an external action.
Do not call tools for general knowledge or simple reasoning.
Never invent tool results.
If a required tool argument is missing, ask one concise follow-up question.
Prefer a direct answer when no tool is needed.

Avoid sycophancy at all costs`;



// --- Tool Implementations ---

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

async function getFileTree(dirPath: string): Promise<string> {
    try {
        async function build(p: string, indent = ""): Promise<string> {
            const entries = await readdir(p, { withFileTypes: true });
            let tree = "";
            for (const e of entries) {
                const fp = path.join(p, e.name);
                tree += `${indent}${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}\n`;
                if (e.isDirectory()) tree += await build(fp, indent + "  ");
            }
            return tree;
        }
        return await build(dirPath);
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

/**
  * Finds files by name or pattern within a directory.
  *
  * @param {string} pattern - The filename or pattern to search for (e.g., 'utils.ts' or '*.test.ts').
  * @param {string} [startPath='.'] - The directory to start the search from.
  * @returns {Promise<string[]>} - A list of matching file paths.
  */
 async function findFile(pattern:string, startPath:string = '.' ) {
    console.log("Called with: " + pattern + " path :" + startPath );
     const results:string[] = [];

     // Helper to convert glob patterns (*, ?) to Regular Expressions
     const globToRegex = (glob:string) => {
         // Escape special regex characters except for * and ?
         let regexStr = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
         // Convert glob '*' to regex '.*'
         regexStr = regexStr.replace(/\*/g, '.*');
         // Convert glob '?' to regex '.'
         regexStr = regexStr.replace(/\?/g, '.');
         // Match the whole string
         return new RegExp(`^${regexStr}$`);
     };

     const patternRegex = globToRegex(pattern);

     async function walk(currentDir:string) {
         try {
             const entries = await readdir(currentDir, { withFileTypes: true });
             for (const entry of entries) {
                 const fullPath = path.join(currentDir, entry.name);

                 if (entry.isDirectory()) {
                     // Recursively search subdirectories
                     await walk(fullPath);
                 } else if (entry.isFile()) {
                     // Check if the filename matches the pattern
                     if (patternRegex.test(entry.name)) {
                         results.push(fullPath);
                     }
                 }
             }
         } catch (error:any) {
             // Handle errors like permission denied or directory not found
             console.error(`Error reading directory ${currentDir}: ${error.message}`);
         }
     }

     // Resolve the absolute path to ensure consistency
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
    if (name === 'get_file_tree') return await getFileTree(args.path);
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
    depth: number = 0
) {
    if (depth > 100) throw new Error("Too many loops");
    if (message) updateMessages(msgs => [...msgs, { role: 'user', content: message }]);

    const res = await fetch(`${OLLAMA_CHAT_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: process.env.MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messagesRef.current.filter((message) => (typeof message.reasoning !== undefined) )
            ],
            tools,
            stream: true,
            cache_prompt: true
        }),
    });

    if (res.status !== 200) throw new Error(`LLM error: ${res.status}`);

    let buffer = "";
    const decoder = new StringDecoder('utf8');
    let response = "";
    const toolCalls: any[] = [];

    if (!res.body) throw new Error("No response body");

    for await (const chunk of res.body) {
        buffer += decoder.write(chunk);
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.trim()) continue;
            const data = line.startsWith('data: ') ? line.slice(6) : line;
            if (data === '[DONE]') break;
            const payload = JSON.parse(data);
            const delta = payload.choices[0].delta;

            if (delta.reasoning_content) {
                const token = delta.reasoning_content;
                updateMessages(msgs => {
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === 'assistant') return [...msgs.slice(0, -1), { ...last, reasoning: (last.reasoning || '') + token }];
                    return [...msgs, { role: 'assistant', content: '', reasoning: token }];
                });
            }

            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, type: tc.type, function: { name: tc.function.name, arguments: '' } };
                    toolCalls[tc.index].function.arguments += tc.function.arguments ?? '';
                }
            }

            if (delta.content) {
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
                await new Promise(r => setTimeout(r, 50));
                for (const tc of toolCalls) {
                    const args = JSON.parse(tc.function.arguments);
                    const result = await dispatchTool(tc.function.name, args);
                    updateMessages(msgs => [...msgs, { role: 'tool', tool_call_id: tc.id, content: String(result) }]);
                }
                await makeCallToLLM(undefined, updateMessages, messagesRef, tools, depth + 1);
            }
        }
    }
}

// --- UI Components ---

const App = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const messagesRef = useRef<Message[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const { exit } = useApp();
    const [tools, setTools] = useState<any[]>(toolsDefinition);

    const updateMessages = useCallback((updateFn: (msgs: Message[]) => Message[]) => {
        const next = updateFn([...messagesRef.current]);
        messagesRef.current = next;
        setMessages(next);
        return next;
    }, []);


    useEffect(() => {
        const init = async () => {
            const healthy = await fetch(OLLAMA_HEALTH_URL).then(r => r.ok).catch(() => false);
            if (!healthy) console.log("Ollama not found.");
/*            const mcpOk = await connectToServer();
            if (mcpOk) {
                const res = await mcpClient.listTools();
                const mcpTools = res.tools.map(t => ({
                    type: "function",
                    function: { name: t.name, description: t.description, parameters: t.inputSchema }
                }));
                setTools(prev => [...prev, ...mcpTools]);
            } */
        };
        init();
    }, []);

    const handleInput = async (value: string) => {
        if (!value.trim() || isProcessing) return;
        if (value === '/exit') { exit(); return; }
        if (value === '/reset') { updateMessages(() => []); setIsProcessing(false); return; }

        setIsProcessing(true);
        setInput('');
        try {
            const currentTools = tools.length > 0 ? tools : toolsDefinition;
            await makeCallToLLM(value, updateMessages, messagesRef, currentTools);
        } catch (e) {
            console.log("Error:", e);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Box flexDirection="column" padding={1}>
            <Box flexDirection="column" marginBottom={1}>
                {messages.map((m, i) => (
                    <Box key={i} flexDirection="column" marginBottom={1}>
                        <Text color={m.role === 'user' ? 'green' : m.role === 'assistant' ? 'cyan' : 'yellow'} bold>
                            {m.role.toUpperCase()}:
                        </Text>
                        {m.reasoning && <Text color="gray" italic>{`\nThinking: ${m.reasoning}`}</Text>}
                        <Text>{m.content}</Text>
                    </Box>
                ))}
                {isProcessing && <Text color="gray">...</Text>}
            </Box>
            <Box>
                <Text color="white" bold>{'> '}</Text>
                <TextInput value={input} onChange={setInput} onSubmit={handleInput} />
            </Box>
        </Box>
    );
};

render(<App />);
