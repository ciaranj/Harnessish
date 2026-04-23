import { Message } from './types.js';
import { systemPrompt } from './constants.js';

export interface LLMPayload {
    model: string | undefined;
    messages: { role: string; content?: string; reasoning_content?: string; tool_calls?: any[] }[];
    tools: any[];
    stream: boolean;
    cache_prompt: boolean;
}

/**
 * Builds the payload to be sent to the LLM.
 */
export function buildLLMPayload(messages: Message[], tools: any[]): LLMPayload {
    // No-Op filter currently
    const filteredMessages = messages.filter((message) => true);
 
    return {
        model: process.env.MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            ...filteredMessages
        ],
        tools,
        stream: true,
        cache_prompt: true
    };
}
