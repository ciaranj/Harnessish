import React from 'react';
import { StringDecoder } from 'node:string_decoder';
import { appendFile } from 'node:fs/promises';
import { Message, Stats } from './types.js';
import { buildLLMPayload } from '../utils.js';
import { LLAMACPP_CHAT_URL } from '../constants.js';
import * as tools from '../tools/filesystem.js';
import * as system from '../tools/system.js';
import * as web from '../tools/web.js';

let mcpClient: any = null;
let mcpTransport: any = null;

export async function connectToServer(url: string): Promise<boolean> {
    try {
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
        mcpClient = new Client({ name: "mcp-client-cli", version: "1.0.0" });
        mcpTransport = new StreamableHTTPClientTransport(new URL(url));
        await mcpClient.connect(mcpTransport);
        return true;
    } catch (e) { return false; }
}

export async function dispatchTool(name: string, args: any): Promise<string> {
    if (name === 'python') return system.runPython(args.code);
    if (name === 'read_files') return await tools.readFiles(args.paths);
    if (name === 'write_to_file') return await tools.writeLocalFile(args.path, args.content);
    if (name === 'replace_content') return await tools.replaceContentLocal(args.path, args.search_string, args.replacement_string, args.replace_all, args.use_regex);
    if (name === 'append_to_file') return await tools.appendLocalFile(args.path, args.content);
    if (name === 'get_git_diff') return await system.getGitDiff(args.path, args.staged);
    if (name === 'get_file_tree') return await tools.getFileTree(args.path, args.max_depth, args.ignore_patterns);
    if (name === 'grep_file') return await system.grepFile(args.path, args.pattern);
    if (name === 'find_file') return await system.findFile(args.pattern, args.path);
    if (name === 'search_web') return await web.searchWeb(args.query);
    if (name === 'fetch_url') return await web.fetchUrl(args.url);
    if (name === 'search_code') return await system.searchCode(args.pattern, args.path);
 
    if (mcpClient) {
        const result = await mcpClient.callTool({ name, arguments: args });
        return JSON.stringify(result.content);
    }
    return "Error: MCP client not connected";
}

export async function makeCallToLLM(
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
    
    setStats(prev => ({ ...prev, tokens: 0, tps: 0, status: 'sending' }));

    const startTime = Date.now();
    let tokenCount = 0;

    const payload = buildLLMPayload(messagesRef.current, tools);
    const body = JSON.stringify(payload);

    const res = await fetch(`${LLAMACPP_CHAT_URL}`, {
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
        if (signal?.aborted) throw new Error("Aborted");
        throw e;
    }
    setStats(prev => ({ ...prev, status: 'idle' }));
}
