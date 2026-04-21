import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Text, Box, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { Message, Stats } from './types.js';
import { toolsDefinition } from './tools.js';
import { OLLAMA_HEALTH_URL } from './constants.js';

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
        const roleLabel = msg.role === 'user' ? 'USER' : msg.role === 'assistant' ? 'ASSISTANT' : 'TOOL';
        lines.push({ content: `[${roleLabel}]`, isHeader: true, role: msg.role, isReasoning: false });
        if (msg.reasoning) {
            for (const l of wrapText(msg.reasoning, width)) {
                lines.push({ content: l, isHeader: false, role: msg.role, isReasoning: true });
            }
        }
        for (const l of wrapText(msg.content, width)) {
            lines.push({ content: l, isHeader: false, role: msg.role, isReasoning: false });
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
        depth?: number
    ) => Promise<void>;
}

export const App = ({ makeCallToLLM }: AppProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const messagesRef = useRef<Message[]>([]);
    const lastCtrlCPressTimeRef = useRef<number | null>(null);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState<Stats>({ tokens: 0, tps: 0, status: 'idle', contextSize: 0 });
    const { exit } = useApp();
    const [tools, setTools] = useState<any[]>(toolsDefinition);

    // --- Scrolling State ---
    const [scrollOffset, setScrollOffset] = useState(0);
    const [isNavMode, setIsNavMode] = useState(false);

    const updateMessages = useCallback((updateFn: (msgs: Message[]) => Message[]) => {
        const next = updateFn([...messagesRef.current]);
        messagesRef.current = next;
        setMessages(next);
        return next;
    }, []);

    const [termWidth, termHeight] = useStdoutDimensions();
    // Reserve rows: padding(2) + msg borders(2, outside content-box) + marginBottom(1) + input(1) + stats box(3) + marginTop(1)
    const VIEWPORT_HEIGHT = Math.max(5, termHeight - 10);
    const terminalWidth = termWidth - 4;

    const renderLines = useMemo(() => {
        return getRenderLines(messages, terminalWidth);
    }, [messages, terminalWidth]);

    // Auto-scroll to bottom when new lines arrive and not in nav mode
    useEffect(() => {
        if (!isNavMode) {
            setScrollOffset(Math.max(0, renderLines.length - VIEWPORT_HEIGHT));
        }
    }, [renderLines.length, isNavMode]);

    // Handle Keyboard for Scrolling
    useInput((input, key) => {

        if (key.ctrl && key.c) {
            const now = Date.now();
            if (lastCtrlCPressTimeRef.current && now - lastCtrlCPressTimeRef.current < 1000) {
                exit();
            }
            lastCtrlCPressTimeRef.current = now;
            return;
        }

        if (isNavMode) {
            if (key.upArrow) {
                setScrollOffset((prev) => Math.max(0, prev - 1));
            } else if (key.downArrow) {
                const maxScroll = Math.max(0, renderLines.length - VIEWPORT_HEIGHT);
                setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
            } else if (key.escape || input === '') {
                setIsNavMode(false);
            }
        } else {
            if (key.escape) {
                setIsNavMode(true);
            }
        }
    });

    useEffect(() => {
        const init = async () => {
            const healthy = await fetch(OLLAMA_HEALTH_URL).then(r => r.ok).catch(() => false);
            if (!healthy) console.log("Ollama not found.");
        };
        init();
    }, []);

    const handleInput = async (value: string) => {
        if (!value.trim() || isProcessing) return;
        if (value === '/exit') { exit(); return; }
        if (value === '/reset') { updateMessages(() => []); setIsProcessing(false); setStats({ tokens: 0, tps: 0, status: 'idle', contextSize: 0 }); return; }

        setIsProcessing(true);
        setInput('');
        try {
            const currentTools = tools.length > 0 ? tools : toolsDefinition;
            await makeCallToLLM(value, updateMessages, messagesRef, currentTools, setStats);
        } catch (e) {
            console.log("Error:", e);
        } finally {
            setIsProcessing(false);
        }
    };

    const visibleLines = useMemo(() => {
        const lines = renderLines.slice(scrollOffset, scrollOffset + VIEWPORT_HEIGHT);
        const pad = VIEWPORT_HEIGHT - lines.length;
        if (pad > 0) {
            const empty: RenderLine = { content: ' ', isHeader: false, role: 'user', isReasoning: false };
            return [...lines, ...Array(pad).fill(empty)];
        }
        return lines;
    }, [renderLines, scrollOffset, VIEWPORT_HEIGHT]);

    return (
        <Box flexDirection="column" padding={1}>
            {/* --- Message Display Area (Scrollable) --- */}
            <Box
                flexDirection="column"
                height={VIEWPORT_HEIGHT}
                borderStyle="single"
                borderColor={isNavMode ? "yellow" : "gray"}
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

            {/* --- Input Area --- */}
            <Box>
                <Text color={isNavMode ? "yellow" : "white"} bold>{isNavMode ? '[NAV MODE - Esc to type] > ' : '> '}</Text>
                <TextInput 
                    value={input} 
                    onChange={setInput} 
                    onSubmit={handleInput} 
                    disabled={isNavMode}
                />
            </Box>

            {/* --- Stats Bar --- */}
            <Box borderStyle="round" borderColor="gray" marginTop={1} paddingX={1}>
                <Text color="gray">
                    {isNavMode ? "MODE: NAVIGATION (Arrows to scroll)" : "MODE: INPUT"} | 
                    Status: <Text color="cyan">{stats.status.toUpperCase()}</Text> | 
                    Tokens: <Text color="cyan">{stats.tokens}</Text> | 
                    TPS: <Text color="cyan">{stats.tps.toFixed(1)}</Text> | 
                    Context: <Text color="cyan">{stats.contextSize}</Text>
                </Text>
            </Box>
        </Box>
    );
};
