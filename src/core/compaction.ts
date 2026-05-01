import fs from 'node:fs';
import path from 'node:path';
import { Message, Stats } from './types.js';
import { MAX_CONTEXT_SIZE, AUTO_COMPACTION_THRESHOLD } from '../constants.js';

export interface CompactionConfig {
    /** When context reaches this fraction of MAX_CONTEXT_SIZE, trigger compaction (default: 0.8) */
    threshold?: number;
    /** Number of recent assistant turns to keep uncompressed (default: 6) */
    recentTurns?: number;
    /** Tool outputs larger than this byte count are externalized to CONTEXT.md (default: 2000) */
    maxToolOutputSize?: number;
    /** Max context size in bytes — overrides MAX_CONTEXT_SIZE from env for testing (default: from constants) */
    maxContextSize?: number;
}

export interface CompactionResult {
    messages: Message[];
    stats?: Partial<Stats>;
    contextMdPath?: string;
}

export interface CompactionStrategy {
    shouldTrigger(messages: Message[], stats: Stats): boolean;
    doCompaction(messages: Message[], stats: Stats): Promise<CompactionResult>;
}

export class NoOpCompactionStrategy implements CompactionStrategy {
    shouldTrigger(_messages: Message[], _stats: Stats): boolean {
        return false;
    }

    async doCompaction(messages: Message[], _stats: Stats): Promise<CompactionResult> {
        return { messages };
    }
}

export class RunningMemoryStrategy implements CompactionStrategy {
    private config: Required<CompactionConfig>;

    constructor(config?: CompactionConfig) {
        this.config = {
            threshold: config?.threshold ?? AUTO_COMPACTION_THRESHOLD,
            recentTurns: config?.recentTurns ?? 6,
            maxToolOutputSize: config?.maxToolOutputSize ?? 2000,
            maxContextSize: config?.maxContextSize ?? MAX_CONTEXT_SIZE,
        };
    }

    shouldTrigger(messages: Message[], stats: Stats): boolean {
        const thresholdBytes = this.config.threshold * this.config.maxContextSize;
        return stats.contextSize > thresholdBytes;
    }

    async doCompaction(
        messages: Message[],
        _stats: Stats,
    ): Promise<CompactionResult> {
        if (messages.length <= this.config.recentTurns * 2) {
            // Not enough messages to warrant compaction
            return { messages };
        }

        // 2. Keep recent turns uncompressed — find the Nth-to-last assistant message
        let recentStartIndex = messages.length;
        let assistantCount = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
                assistantCount++;
                if (assistantCount >= this.config.recentTurns) {
                    recentStartIndex = i;
                    break;
                }
            }
        }

        const recentMessages = messages.slice(recentStartIndex);
        const olderMessages = messages.slice(0, recentStartIndex);

        // 3. Compress older messages: drop reasoning, externalize large tool outputs
        const compressed: Message[] = [];
        let contextMdContent = '';
        let toolOutputCounter = 1;

        for (const msg of olderMessages) {
            if (msg.role === 'user') {
                // Keep user messages as-is — they define conversation intent
                compressed.push(msg);
            } else if (msg.role === 'assistant') {
                // Keep text response, drop reasoning content for older turns
                const cleanMsg: Message = {
                    role: 'assistant',
                    content: msg.content ?? '',
                };
                if( cleanMsg.content ) {
                    compressed.push(cleanMsg);
                }
            } else if (msg.role === 'tool') {
                const contentLength = msg.content?.length ?? 0;
                if (contentLength > this.config.maxToolOutputSize) {
                    // Externalize large tool output to CONTEXT.md
                    const ts = new Date().toISOString();
                    contextMdContent += `## Tool Output #${toolOutputCounter} (at ${ts})\n${msg.content}\n---\n\n`;
                    toolOutputCounter++;

                    // Replace with a reference line
                    compressed.push({
                        role: 'assistant',
                        content: `[Tool output externalized to CONTEXT.md (${contentLength} bytes)]`,
                    });
                } else {
                    // Small tool output stays in context as-is
                    compressed.push(msg);
                }
            }
        }

        // 4. Write CONTEXT.md if we have externalized content
        let contextMdPath: string | undefined;
        if (contextMdContent) {
            const projectRoot = process.cwd();
            contextMdPath = path.join(projectRoot, 'CONTEXT.md');
            fs.appendFileSync(contextMdPath, contextMdContent, 'utf-8');
        }

        // 5. Combine: system + compressed older + recent uncompressed (full fidelity)
        const newMessages = [...compressed, ...recentMessages];

        return { messages: newMessages, contextMdPath };
    }
}
