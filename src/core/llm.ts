import React from 'react';
import { StringDecoder } from 'node:string_decoder';
import { Message, Stats } from './types.js';
import { Session, SessionStats, saveSession } from './session.js';
import { CompactionStrategy, NoOpCompactionStrategy } from './compaction.js';
import { buildLLMPayload } from '../utils.js';
import { LLAMACPP_CHAT_URL } from '../constants.js';
import { toolsByName, toolsToOpenAITools } from '../tools/index.js';

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
    const tool = toolsByName[name];
    if (tool) {
        const result = await tool.execute(args);
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    }
    if (mcpClient) {
        const result = await mcpClient.callTool({ name, arguments: args });
        return JSON.stringify(result.content);
    }
    return "Error: Tool not found and MCP client not connected";
}

export async function makeCallToLLM(
    message: string | undefined,
    updateMessages: (updateFn: (msgs: Message[]) => Message[]) => void,
    messagesRef: React.MutableRefObject<Message[]>,
    tools: any[],
    setStats: React.Dispatch<React.SetStateAction<Stats>>,
    session: Session,
    saveSessionCallback: (session: Session) => Promise<void>,
    compactionStrategy: CompactionStrategy,
    signal?: AbortSignal
) {
    let loopCount = 0;
    const maxLoops = 100;
    
    while (loopCount < maxLoops) {
        loopCount++;
        
        if (message) updateMessages(msgs => [...msgs, { role: 'user', content: message }]);
        message = undefined;
        
        let currentStats: Stats = { tokens: 0, tps: 0, status: 'sending', contextSize: 0, cachedContextSize: 0 };
        setStats((prev) => {
            currentStats = { ...prev, tokens: 0, tps: 0, status: 'sending' as const };
            return currentStats;
        });

        const startTime = Date.now();
        let tokenCount = 0;

        const payload = buildLLMPayload(messagesRef.current, toolsToOpenAITools(tools));
        const body = JSON.stringify(payload);

        session.messages = messagesRef.current;
        session.stats = {contextSize : currentStats.contextSize };
        await saveSession(session);

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

        let didToolCall = false;

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
                        currentStats = { ...currentStats, contextSize: payload.timings.prompt_n + payload.timings.cache_n, cachedContextSize: payload.timings.cache_n };
                        setStats(currentStats);
                    }
                    const delta = payload.choices[0].delta;

                    tokenCount++;
                    const elapsedSeconds = (Date.now() - startTime) / 1000;
                    const tps = elapsedSeconds > 0 ? tokenCount / elapsedSeconds : 0;

                    if (delta.reasoning_content) {
                        currentStats = { ...currentStats, tokens: tokenCount, tps: 0, status: 'thinking' as const };
                        setStats(currentStats);
                        const token = delta.reasoning_content;
                        updateMessages(msgs => {
                            const last = msgs[msgs.length - 1];
                            if (last && last.role === 'assistant') return [...msgs.slice(0, -1), { ...last, reasoning_content: (last.reasoning_content || '') + token }];
                            return [...msgs, { role: 'assistant', content: '', reasoning_content: token }];
                        });
                    }

                    if (delta.tool_calls) {
                        currentStats = { ...currentStats, tokens: tokenCount, tps, status: 'tool_calling' as const };
                        setStats(currentStats);
                        for (const tc of delta.tool_calls) {
                            if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, type: tc.type, function: { name: tc.function.name, arguments: '' } };
                            toolCalls[tc.index].function.arguments += tc.function.arguments ?? '';
                        }
                    }

                    if (delta.content) {
                        currentStats = { ...currentStats, tokens: tokenCount, tps, status: 'generating' as const };
                        setStats(currentStats);
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
                        
                        currentStats = { ...currentStats, status: 'tool_running' as const };
                        setStats(currentStats);

                        for (const tc of toolCalls) {
                            const args = JSON.parse(tc.function.arguments);
                            const result = await dispatchTool(tc.function.name, args);
                            updateMessages(msgs => [...msgs, { role: 'tool', tool_call_id: tc.id, content: String(result) }]);
                        }
                        didToolCall = true;
                    }
                }
            }
        } catch (e) {
            if (signal?.aborted) throw new Error("Aborted");
            throw e;
        }

        session.stats = {contextSize : currentStats.contextSize };
        session.messages = messagesRef.current;
        await saveSession(session);

        const messagesBeforeCompaction = messagesRef.current;
        
        if (compactionStrategy.shouldTrigger(messagesBeforeCompaction, currentStats)) {
            const result = await compactionStrategy.doCompaction(messagesBeforeCompaction, currentStats);
            updateMessages(() => result.messages);
            if (result.stats) {
                currentStats = { ...currentStats, ...result.stats };
            }
        }

        currentStats = { ...currentStats, status: 'idle' as const };
        setStats(currentStats);
        
        if (!didToolCall) break;
    }
    
    if (loopCount >= maxLoops) throw new Error("Too many loops");
}
