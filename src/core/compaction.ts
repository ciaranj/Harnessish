import { Message, Stats } from './types.js';

export interface CompactionStrategy {
    shouldTrigger(messages: Message[], stats: Stats): boolean;
    doCompaction(messages: Message[], stats: Stats): Promise<{ messages: Message[]; stats?: Partial<Stats> }>;
}

export class NoOpCompactionStrategy implements CompactionStrategy {
    shouldTrigger(_messages: Message[], _stats: Stats): boolean {
        return false;
    }

    async doCompaction(messages: Message[], _stats: Stats): Promise<{ messages: Message[] }> {
        return { messages };
    }
}
