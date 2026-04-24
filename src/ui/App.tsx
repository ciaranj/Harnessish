import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Text, Box, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { Message, Stats } from '../core/types.js';
import { toolsDefinition } from '../tools/definitions.js';
import { LLAMACPP_HEALTH_URL } from '../constants.js';

// --- UI Helpers ---

function useStdoutDimensions(): [number, number] {
    const { stdout } = useStdout();
    const [dimensions, setDimensions] = useState<[number, number]>([stdout.columns, stdout.rows]);
    useEffect(() => {
        const handler = () => setDimensions([stdout.columns, stdout.rows]);
        stdout.on('resize', handler);
        return () => { stdout.off('resize', handler); };
    }, [stdout]);
    return dimensions;
}

interface RenderLine {
    content: string;
    isHeader: boolean;
    role: string;
    isReasoning: boolean;
}

function wrapParagraph(text: string, width: number): string[] {
    if (!text) return [' '];
    const lines: string[] = [];
    const words = text.split(/(\s+)/);
    let currentLine = "";

    for (const word of words) {
        if ((currentLine + word).length <= width) {
            currentLine += word;
        } else {
            if (currentLine) lines.push(currentLine.trimEnd());
            if (word.length > width) {
                let remaining = word;
                while (remaining.length > width) {
                    lines.push(remaining.substring(0, width));
                    remaining = remaining.substring(width);
                }
                currentLine = remaining;
            } else {
                currentLine = word.trimStart();
            }
        }
    }
    if (currentLine) lines.push(currentLine.trimEnd());
    return lines.length ? lines : [' '];
}

function wrapText(text: string, width: number): string[] {
    if (!text) return [];
    const paragraphs = text.split('\n');
    const result: string[] = [];
    for (const para of paragraphs) {
        result.push(...wrapParagraph(para, width));
    }
    while (result.length > 0 && result[result.length - 1].trim() === '') {
        result.pop();
    }
    return result;
}

function getRenderLines(messages: Message[], width: number): RenderLine[] {
    const lines: RenderLine[] = [];
    for (const msg of messages) {
        if (msg.role === 'tool') continue;
        const roleLabel = msg.role === 'user' ? 'USER' : msg.role === 'assistant' ? 'ASSISTANT' : 'TOOL';
        lines.push({ content: `[${roleLabel}]`, isHeader: true, role: msg.role, isReasoning: false });
        if (msg.reasoning_content) {
            for (const l of wrapText(msg.reasoning_content, width)) {
                lines.push({ content: l, isHeader: false, role: msg.role, isReasoning: true });
            }
        }
        if (msg.content) {
            for (const l of wrapText(msg.content, width)) {
                lines.push({ content: l, isHeader: false, role: msg.role, isReasoning: false });
            }
        }
        if (msg.tool_calls && msg.tool_calls.length > 0) {
            const toolNames = msg.tool_calls.map((tc: any) => tc.function?.name || tc.name).join(', ');
            lines.push({ content: `🛠️ ${toolNames}`, isHeader: false, role: msg.role, isReasoning: false });
        }
    }
    return lines;
}

// --- App Component ---

interface AppProps {
    makeCallToLLM: (
        message: string | undefined,
        updateMessages: (updateFn: (msgs: Message[]) => Message[]) => void,
        messagesRef: React.MutableRefObject<Message[]>,
        tools: any[],
        setStats: React.Dispatch<React.SetStateAction<Stats>>,
        depth?: number,
        signal?: AbortSignal
    ) => Promise<void>;
}

export const App = ({ makeCallToLLM }: AppProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const messagesRef = useRef<Message[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState<Stats>({ tokens: 0, tps: 0, status: 'idle', contextSize: 0, cachedContextSize:0 });
    const [notification, setNotification] = useState<string | null>(null);
    const { exit } = useApp();
    const [tools, setTools] = useState<any[]>(toolsDefinition);

    const [scrollOffset, setScrollOffset] = useState(0);
    const [isNavMode, setIsNavMode] = useState(false);
    const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const suppressNextInputChange = useRef(false);

    const updateMessages = useCallback((updateFn: (msgs: Message[]) => Message[]) => {
        const next = updateFn([...messagesRef.current]);
        messagesRef.current = next;
        setMessages(next);
        return next;
    }, []);

    const [termWidth, termHeight] = useStdoutDimensions();

    const reservedHeight = useMemo(() => {
        let height = 0;
        height += 1;
        height += 1;
        height += 1;
        height += 1;
        height += 1;
        height += 1;
        if (notification) height += 2;
        if (isConfirmingCancel) height += 2;
        return height;
    }, [notification, isConfirmingCancel]);

    const VIEWPORT_HEIGHT = Math.max(5, termHeight - reservedHeight);
    const terminalWidth = termWidth - 4;

    const renderLines = useMemo(() => {
        return getRenderLines(messages, terminalWidth);
    }, [messages, terminalWidth]);

    useEffect(() => {
        if (!isNavMode && !isConfirmingCancel) {
            setScrollOffset(Math.max(0, renderLines.length - VIEWPORT_HEIGHT));
        }
    }, [renderLines.length, isNavMode, isConfirmingCancel]);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 10000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    useInput((input, key) => {
        if (isConfirmingCancel) {
            if (input.toLowerCase() === 'y') {
                if (stats.status === 'idle') exit();
                else abortControllerRef.current?.abort();
            }
            setIsConfirmingCancel(false);
            suppressNextInputChange.current = true;
            return;
        }

        if (isNavMode) {
            if (key.upArrow) setScrollOffset((prev) => Math.max(0, prev - 1));
            else if (key.downArrow) {
                const maxScroll = Math.max(0, renderLines.length - VIEWPORT_HEIGHT);
                setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
            } else if (key.escape || input === '') setIsNavMode(false);
        } else {
            if (key.escape) { setIsConfirmingCancel(true); return; }
            if (key.ctrl && input === 'n') {
                suppressNextInputChange.current = true;
                setIsNavMode(true);
            }
        }
    });

    useEffect(() => {
        const init = async () => {
            const healthy = await fetch(LLAMACPP_HEALTH_URL).then(r => r.ok).catch(() => false);
            if (!healthy) console.log("Ollama not found.");
        };
        init();
    }, []);

    const handleInput = async (value: string) => {
        if (!value.trim() || isProcessing || isConfirmingCancel) return;
        if (value === '/exit') { exit(); return; }
        if (value === '/reset') { 
            updateMessages(() => []); setIsProcessing(false); setStats({ tokens: 0, tps: 0, status: 'idle', contextSize: 0, cachedContextSize:0 });
            setInput('');
            return;
        }
        
        if (value === '/dump_context') {
            try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `context_dump_${timestamp}.json`;
                const fs = await import('node:fs');
                const path = (await import('node:path')).default;
                const os = await import('node:os');
                const filePath = path.join(os.tmpdir(), filename);
                const data = JSON.stringify(messagesRef.current, null, 2);
                fs.default.writeFileSync(filePath, data);
                setNotification(`Context dumped to: ${filePath}`);
            } catch (err) {
                setNotification(`Failed to dump context: ${err instanceof Error ? err.message : String(err)}`);
            }
            setInput('');
            return;
        }

        setIsProcessing(true);
        setInput('');
        abortControllerRef.current = new AbortController();
        
        try {
            const currentTools = tools.length > 0 ? tools : toolsDefinition;
            await makeCallToLLM(value, updateMessages, messagesRef, currentTools, setStats, undefined, abortControllerRef.current.signal);
        } catch (e) {
            if (e instanceof Error && e.message === 'Aborted') setNotification("Turn abandoned.");
            else console.log("Error:", e);
        } finally {
            setIsProcessing(false);
            abortControllerRef.current = null;
        }
    };

    const visibleLines = useMemo(() => {
        const lines = renderLines.slice(scrollOffset, scrollOffset + VIEWPORT_HEIGHT);
        const pad = VIEWPORT_HEIGHT - lines.length;
        const empty: RenderLine = { content: ' ', isHeader: false, role: 'user', isReasoning: false };
        if (pad > 0) return [...lines, ...Array(pad).fill(empty)];
        return lines;
    }, [renderLines, scrollOffset, VIEWPORT_HEIGHT]);

    return (
        <Box flexDirection="column" padding={0}>
            <Box
                flexDirection="column"
                height={VIEWPORT_HEIGHT}
                borderStyle="single"
                borderColor={isNavMode ? "yellow" : isConfirmingCancel ? "red" : "gray"}
                marginBottom={1}
            >
                {visibleLines.length === 0 ? (
                    <Text color="gray" dimColor>No messages yet. Type something below!</Text>
                ) : (
                    visibleLines.map((line, i) => (
                        <Text 
                            key={i} 
                            color={
                                line.isHeader 
                                    ? (line.role === 'user' ? 'green' : line.role === 'assistant' ? 'cyan' : 'yellow') 
                                    : (line.isReasoning ? 'gray' : 'white')
                            }
                            bold={line.isHeader}
                            italic={line.isReasoning}
                        >
                            {line.content}
                        </Text>
                    ))
                )}
            </Box>

            {notification && (
                <Box marginBottom={1} borderStyle="single" borderColor="magenta">
                    <Text color="magenta" dimColor> {notification} </Text>
                </Box>
            )}

            {isConfirmingCancel && (
                <Box marginBottom={1} borderStyle="double" borderColor="red">
                    <Text color="red" bold>
                        {stats.status === 'idle'
                            ? 'Are you sure you want to leave Harnessish? (y/N)'
                            : 'Are you sure you want to cancel the current turn? (y/N)'}
                    </Text>
                </Box>
            )}

            <Box>
                <Text color={isNavMode ? "yellow" : isConfirmingCancel ? "red" : "white"} bold>{isNavMode ? '[NAV MODE] > ' : isConfirmingCancel ? stats.status == 'idle' ? '[LEAVING] >': '[CANCELING] > ' : '> '}</Text>
                <TextInput
                    value={input}
                    onChange={(val) => {
                        if (suppressNextInputChange.current) {
                            suppressNextInputChange.current = false;
                            return;
                        }
                        setInput(val);
                    }}
                    onSubmit={handleInput}
                />
            </Box>

            <Box borderStyle="round" borderColor="gray" marginTop={1} paddingX={1}>
                <Text color="gray">
                    {isNavMode ? "MODE: NAVIGATION (Arrows to scroll)" : "MODE: INPUT"} | 
                    Status: <Text color="cyan">{stats.status.toUpperCase()}</Text> | 
                    Tokens: <Text color="cyan">{stats.tokens}</Text> | 
                    TPS: <Text color="cyan">{stats.tps.toFixed(1)}</Text> | 
                    Context: <Text color="cyan">{stats.contextSize} ({stats.cachedContextSize} cached)</Text>
                </Text>
            </Box>
        </Box>
    );
};
