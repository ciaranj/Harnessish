import { render } from 'ink';
import { App } from './ui/App.js';
import { makeCallToLLM } from './core/llm.js';
import { loadSession, createSession, SessionStore } from './core/session.js';

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

    render(<App makeCallToLLM={makeCallToLLM} store={store} />);
}

main();
