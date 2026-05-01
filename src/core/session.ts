import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Message } from './types.js';

export type SessionStats = {
    contextSize: number;
};

export type Session = {
    id: string;
    createdAt: string;
    updatedAt: string;
    version: number;
    messages: Message[];
    stats?: SessionStats;
};

const SESSION_DIRNAME = '.h/sessions';
const SESSION_FILENAME = 'session.json';
const BACKUP_SUFFIX = '.bak';
const TEMP_SUFFIX = '.tmp';
const FULL_HISTORY_FILENAME = 'session_full_history.json';

async function ensureSessionDir(directory: string): Promise<void> {
    const sessionDir = path.join(directory, SESSION_DIRNAME);
    if (!fs.existsSync(sessionDir)) {
        await fs.promises.mkdir(sessionDir, { recursive: true });
    }
}

function getSessionFilePath(directory: string = process.cwd()): string {
    return path.join(directory, SESSION_DIRNAME, SESSION_FILENAME);
}

export function createSession(directory: string = process.cwd()): Session {
    const now = new Date().toISOString();
    return {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        version: 0,
        messages: []
    };
}

async function loadSessionFromFile(filePath: string): Promise<Session | null> {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const data = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(data);
        
        if (!parsed.id || !parsed.createdAt || !parsed.updatedAt || parsed.version === undefined || !Array.isArray(parsed.messages)) {
            return null;
        }
        
        return parsed as Session;
    } catch (err) {
        console.error(`Failed to parse session file: ${err}`);
        return null;
    }
}

async function loadBackupFromFile(filePath: string): Promise<Session | null> {
    const backupPath = filePath + BACKUP_SUFFIX;
    try {
        if (!fs.existsSync(backupPath)) {
            return null;
        }
        const data = fs.readFileSync(backupPath, 'utf-8');
        const parsed = JSON.parse(data);
        
        if (!parsed.id || !parsed.createdAt || !parsed.updatedAt || parsed.version === undefined || !Array.isArray(parsed.messages)) {
            return null;
        }
        
        return parsed as Session;
    } catch (err) {
        console.error(`Failed to parse backup file: ${err}`);
        return null;
    }
}

export async function loadSession(directory: string = process.cwd()): Promise<Session | null> {
    const filePath = getSessionFilePath(directory);
    
    await ensureSessionDir(directory);
    
    let session = await loadSessionFromFile(filePath);
    if (session) {
        return session;
    }
    
    const backupSession = await loadBackupFromFile(filePath);
    if (backupSession) {
        console.log('Loaded session from backup');
        return backupSession;
    }
    
    return null;
}

export async function saveSession(session: Session, directory: string = process.cwd()): Promise<void> {
    const filePath = getSessionFilePath(directory);
    const tempPath = filePath + TEMP_SUFFIX;
    
    await ensureSessionDir(directory);
    
    session.updatedAt = new Date().toISOString();
    session.version += 1;
    
    const data = JSON.stringify(session, null, 2);
    fs.writeFileSync(tempPath, data, 'utf-8');
    fs.renameSync(tempPath, filePath);
}

export async function resetSession(directory: string = process.cwd()): Promise<Session> {
    const filePath = getSessionFilePath(directory);
    
    try {
        if (fs.existsSync(filePath)) {
            const oldData = fs.readFileSync(filePath, 'utf-8');
            const oldSession = JSON.parse(oldData) as Session;
            
            const archivePath = path.join(
                path.dirname(filePath),
                `session_archive_${oldSession.id}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
            );
            fs.writeFileSync(archivePath, oldData);
            
            if (fs.existsSync(filePath + BACKUP_SUFFIX)) {
                fs.unlinkSync(filePath + BACKUP_SUFFIX);
            }
        }
    } catch (err) {
        console.error(`Failed to archive old session: ${err}`);
    }
    
    const newSession = createSession(directory);
    await saveSession(newSession, directory);
    return newSession;
}

export async function trySaveSession(session: Session, directory: string = process.cwd()): Promise<{ saved: boolean; error?: Error }> {
    const filePath = getSessionFilePath(directory);
    const tempPath = filePath + TEMP_SUFFIX;

    try {
        const existingData = fs.readFileSync(filePath, 'utf-8');
        const existingSession = JSON.parse(existingData) as Session;

        if (existingSession.version !== session.version - 1) {
            return { saved: false, error: new Error('Version mismatch - session was modified by another process') };
        }

        await saveSession(session, directory);
        return { saved: true };
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            try {
                const data = JSON.stringify(session, null, 2);
                fs.writeFileSync(tempPath, data, 'utf-8');
                fs.renameSync(tempPath, filePath);
                return { saved: true };
            } catch (writeErr) {
                return { saved: false, error: writeErr as Error };
            }
        }
        return { saved: false, error: err as Error };
    }
}

// --- SessionStore: immutable session lifecycle manager ---

/** Thin wrapper around a Session that guarantees immutability. */
export class SessionStore {
    private current: Session;
    private directory: string;

    constructor(initial: Session, directory: string = process.cwd()) {
        this.current = initial;
        this.directory = directory;
    }

    /** Returns a deep snapshot of the current session (safe to read, not to mutate). */
    getSnapshot(): Session {
        return { ...this.current, messages: [...this.current.messages] };
    }

    /** Returns a shallow copy of messages — caller should not mutate in place. */
    getMessages(): Message[] {
        return this.current.messages;
    }

    /**
     * Update messages immutably. `updater` receives the current message list
     * and must return a new array (or the same if unchanged).
     */
    updateMessages(updater: (msgs: Message[]) => Message[]): void {
        const next = updater([...this.current.messages]);
        this.current = { ...this.current, messages: next, updatedAt: new Date().toISOString() };
    }

    /** Update stats immutably. Only updates fields that are non-undefined in `partial`. */
    setStats(partial: Partial<Session['stats']>): void {
        if (!partial || Object.keys(partial).length === 0) return;
        // Filter out undefined values — spread of Partial<T> into T is unsafe for TS
        const defined: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(partial)) {
            if (v !== undefined) defined[k] = v;
        }
        this.current = {
            ...this.current,
            stats: { ...this.current.stats, ...defined } as SessionStats,
            updatedAt: new Date().toISOString(),
        };
    }

    /** Persist the current session to disk. */
    async persist(): Promise<void> {
        await saveSession(this.current, this.directory);
    }

    /**
     * Reset: archive the old session and create a fresh one.
     * Returns the new session (already saved).
     */
    async reset(): Promise<Session> {
        const newSession = await resetSession(this.directory);
        this.current = newSession;
        return newSession;
    }

    /**
     * Resolve a conflict when another process wrote to disk.
     * Merges the remote session's messages into this store, keeping ours as a suffix.
     */
    resolveConflict(remote: Session): void {
        // Take remote messages (authoritative), then append any messages we had that aren't in remote
        const remoteMsgIds = new Set(remote.messages.map((m, i) => `${m.role}-${i}`));
        const localOnly = this.current.messages.filter(
            (m, i) => !remoteMsgIds.has(`${m.role}-${i}`)
        );
        this.current = {
            ...remote,
            messages: [...remote.messages, ...localOnly],
            updatedAt: new Date().toISOString(),
        };
    }
}
