import pino, { stdTimeFunctions } from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import { AppConfig } from './config/index.js';

const LOGS_DIR = '.h/logs';
const LOG_FILE = 'harry.log';

function resolveLogDir(cwd: string): string {
    return path.join(cwd, LOGS_DIR);
}

function ensureLogDir(cwd: string): void {
    const dir = resolveLogDir(cwd);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Single shared logger per process, resolved against the initial cwd.
let _logger: pino.Logger | null = null;

function getLogger(cwd: string): pino.Logger {
    if (!_logger) {
        const dir = resolveLogDir(cwd);
        ensureLogDir(cwd);
        const transport = pino.transport({
            target: 'pino/file',
            options: { destination: path.join(dir, LOG_FILE) },
        });
        // Read log level from config store (defaults to 'info')
        const logLevel = AppConfig.getInstance().getString('LOG_LEVEL') || 'info';
        _logger = pino(
            {
                level: logLevel,
                timestamp: stdTimeFunctions.isoTime,
                formatters: {
                    level: (label) => ({ level: label.toUpperCase() }),
                },
            },
            transport
        );
    }
    return _logger;
}

/** Get the shared pino logger for the given cwd. */
export function getLoggerInstance(cwd: string): pino.Logger {
    return getLogger(cwd);
}
