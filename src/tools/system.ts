import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const execAsync = promisify(exec);

export async function getGitDiff(path = '', staged = false): Promise<string> {
    try {
        const flag = staged ? '--cached' : '';
        const command = `git diff ${flag} ${path}`.trim();
        const { stdout } = await execAsync(command);
        return stdout.trim() || "No changes detected in the specified scope.";
    } catch (error: any) { return error.stdout || `Error running git diff: ${error.message}`; }
}

export function runPython(code: string, timeoutMs = 60_000): Promise<string> {
    return new Promise((resolve) => {
        const proc = spawn('ipython', ['--no-banner', '--no-confirm-exit', '-c', code], { timeout: timeoutMs });
        let stdout = '', stderr = '';
        proc.stdout.on('data', (d) => { stdout += d; });
        proc.stderr.on('data', (d) => { stderr += d; });
        proc.on('close', (code) => {
            if (code !== 0 && stderr) resolve(`Error:\n${stderr.trim()}`);
            else resolve(stdout.trim() || '(no output)');
        });
        proc.on('error', (e) => resolve(`Failed to launch ipython: ${e.message}`));
    });
}

export async function grepFile(filePath: string, pattern: string): Promise<string> {
    try {
        const { stdout } = await execAsync(`grep -nE "${pattern}" "${filePath}"`);
        if (!stdout.trim()) return `No matches found for "${pattern}" in "${filePath}".`;
        return stdout.trim();
    } catch (error: any) { return error.stdout || `Error: ${error.message}`; }
}

export async function searchCode(pattern: string, path: string = '.'): Promise<string> {
    try {
        const { stdout } = await execAsync(`grep -rnE "${pattern}" ${path}`);
        if (!stdout.trim()) return `No matches found for "${pattern}" in "${path}".`;
        const lines = stdout.trim().split('\n');
        return lines.length > 50 ? `Found ${lines.length} matches. Showing first 50:\n${lines.slice(0, 50).join('\n')}\n...` : stdout.trim();
    } catch (error: any) { return `Error: ${error.message}`; }
}

export async function findFile(pattern: string, startPath: string = '.'): Promise<string> {
    const results: string[] = [];
    const globToRegex = (glob: string) => {
        let regexStr = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        regexStr = regexStr.replace(/\*/g, '.*');
        regexStr = regexStr.replace(/\?/g, '.');
        return new RegExp(`^${regexStr}$`);
    };
    const patternRegex = globToRegex(pattern);

    async function walk(currentDir: string) {
        try {
            const fs = await import('node:fs/promises');
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) await walk(fullPath);
                else if (entry.isFile() && patternRegex.test(entry.name)) results.push(fullPath);
            }
        } catch (error: any) { console.error(`Error reading directory ${currentDir}: ${error.message}`); }
    }

    const absoluteStartPath = path.resolve(startPath);
    await walk(absoluteStartPath);
    return results.join('\n') || 'No files found.';
}
