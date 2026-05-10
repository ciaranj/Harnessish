import { render } from 'ink';
import type pino from 'pino';
import { App } from './ui/App.js';
import { makeCallToLLM } from './core/llm.js';
import { loadSession, createSession, SessionStore } from './core/session.js';
import { GuardrailConfigManager, createDefaultConfigStore } from './core/config/index.js';
import { getLoggerInstance } from './core/log.js';

async function main() {
    const log = getLoggerInstance(process.cwd());
    let store: SessionStore;
    let sessionLogger: pino.Logger;
    try {
        const loaded = await loadSession();
        const session = loaded || createSession();
        store = new SessionStore(session, process.cwd());
        sessionLogger = log.child({ sessionId: session.id });
        if (loaded) {
            sessionLogger.info({ messages: session.messages.length }, 'Harry started — resumed session');
        } else {
            await store.persist();
            sessionLogger.info({ messages: session.messages.length }, 'Harry started — new session');
        }
    } catch (err) {
        console.error('Failed to load/create session:', err);
        const session = createSession();
        store = new SessionStore(session, process.cwd());
        sessionLogger = log.child({ sessionId: session.id });
    }

    // Load guardrail config early so tools can check permissions.
    const configStore = createDefaultConfigStore();
    const guardrails = new GuardrailConfigManager(configStore);
    sessionLogger.info('Guardrail config loaded');

    render(<App makeCallToLLM={makeCallToLLM} store={store} sessionLogger={sessionLogger} guardrails={guardrails} />);
}

main();
