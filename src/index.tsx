import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { makeCallToLLM } from './core/llm.js';
import { loadSession, Session, SessionStats, saveSession } from './core/session.js';
import { randomUUID } from 'node:crypto';

async function main() {
    let initialSession: Session | null = null;
    try {
        initialSession = await loadSession();
    } catch (err) {
        console.error('Failed to load session:', err);
    }

    const initialMessages = initialSession?.messages || [];
    const initialSessionId = initialSession?.id || randomUUID();
    const initialStats: SessionStats | undefined = initialSession?.stats;

    render(<App makeCallToLLM={makeCallToLLM} initialMessages={initialMessages} initialSessionId={initialSessionId} initialStats={initialStats} />);
}

main();
