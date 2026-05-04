import { render } from 'ink';
import { App } from './ui/App.js';
import { makeCallToLLM } from './core/llm.js';
import { loadSession, createSession, SessionStore } from './core/session.js';
import { GuardrailConfigManager, createDefaultConfigStore } from './core/config/index.js';

async function main() {
    let store: SessionStore;
    try {
        const loaded = await loadSession();
        const session = loaded || createSession();
        store = new SessionStore(session);
        if (loaded) {
            console.log(`Resumed session: ${session.id} (${session.messages.length} messages)`);
        } else {
            await store.persist();
            console.log('Started new session');
        }
    } catch (err) {
        console.error('Failed to load/create session:', err);
        store = new SessionStore(createSession());
    }

    // Load guardrail config early so tools can check permissions.
    const configStore = createDefaultConfigStore();
    const guardrails = new GuardrailConfigManager(configStore);
    console.log('Guardrail config loaded.');

    render(<App makeCallToLLM={makeCallToLLM} store={store} guardrails={guardrails} />);
}

main();
