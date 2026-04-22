import { Message } from './types.js';
import { systemPrompt } from './constants.js';

export interface LLMPayload {
    model: string | undefined;
    messages: { role: string; content: string; reasoning?: string; tool_calls?: any[] }[];
    tools: any[];
    stream: boolean;
    cache_prompt: boolean;
}

/**
 * Builds the payload to be sent to the LLM.
 */
export function buildLLMPayload(messages: Message[], tools: any[]): LLMPayload {
    const filteredMessages = messages.filter((message) => typeof message.reasoning === 'undefined');
 
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
