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

const SESSION_FILENAME = 'session.json';
const BACKUP_SUFFIX = '.bak';
const TEMP_SUFFIX = '.tmp';

function getSessionFilePath(directory: string = process.cwd()): string {
    return path.join(directory, SESSION_FILENAME);
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
