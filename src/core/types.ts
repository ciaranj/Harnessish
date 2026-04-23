export type Message = {
    role: 'user' | 'assistant' | 'tool' | 'system';
    content?: string;
    reasoning_content?: string;
    tool_calls?: any[];
    tool_call_id?: string;
};

export type Stats = {
    tokens: number;
    tps: number;
    status: 'idle' | 'sending' | 'thinking' | 'generating' | 'tool_calling' | 'tool_running';
    contextSize: number;
    cachedContextSize: number;
};
