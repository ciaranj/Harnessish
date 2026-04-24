import { readFile, writeFile, readdir, appendFile, stat } from 'node:fs/promises';
import path from 'node:path';

export async function readFiles(paths: string[]): Promise<string> {
    if (paths.length === 0) return '[]';

    const results: Array<{ path: string; success: boolean; content?: string; error?: string }> = [];
    for (const p of paths) {
        try {
            const content = await readFile(p, 'utf-8');
            results.push({ path: p, success: true, content });
        } catch (error: any) {
            results.push({ path: p, success: false, error: error.message });
        }
    }
    return JSON.stringify(results, null, 2);
}

export async function writeLocalFile(path: string, content: string): Promise<string> {
    try { await writeFile(path, content, 'utf-8'); return `Successfully wrote to ${path}`; }
    catch (error: any) { return `Error writing to file at "${path}": ${error.message}`; }
}

export async function appendLocalFile(path: string, content: string): Promise<string> {
    try { await appendFile(path, content, 'utf-8'); return `Successfully appended to ${path}`; }
    catch (error: any) { return `Error: ${error.message}`; }
}

export async function replaceContentLocal(path: string, searchString: string, replacementString: string, replaceAll = false, useRegex = false): Promise<string> {
    try {
        const content = await readFile(path, 'utf-8');
        let matches: RegExpMatchArray | null;
        
        if (useRegex) {
            const regex = new RegExp(searchString, 'g');
            matches = content.match(regex);
            if (!matches) return `Error: Pattern "${searchString}" not found in "${path}".`;
            const newContent = content.replace(regex, replacementString);
            await writeFile(path, newContent, 'utf-8');
            const count = replaceAll ? matches.length : 1;
            return `Successfully replaced ${count} occurrence(s) in ${path}`;
        } else {
            if (!content.includes(searchString)) return `Error: Search string not found in "${path}".`;
            const newContent = replaceAll ? content.split(searchString).join(replacementString) : content.replace(searchString, replacementString);
            await writeFile(path, newContent, 'utf-8');
            const count = (content.split(searchString).length - 1);
            return `Successfully replaced ${replaceAll ? count : 1} occurrence(s) in ${path}`;
        }
    } catch (error: any) { return `Error: ${error.message}`; }
}



export async function getFileTree(dirPath: string, maxDepth: number = 3, ignorePatterns: string[] = ['node_modules', '.git', 'build', 'dist']): Promise<string> {
    try {
        const formatSize = (bytes: number): string => {
            if (bytes < 1024) return `${bytes}B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
            if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
        };

        async function build(p: string, currentDepth: number, indent = ""): Promise<string> {
            if (currentDepth > maxDepth) return "";
            let entries;
            try { entries = await readdir(p, { withFileTypes: true }); }
            catch (e: any) { return `${indent}[DIR] ${path.basename(p)} (Permission Denied)\n`; }

            let tree = "";
            const sortedEntries = entries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });

            for (const e of sortedEntries) {
                if (ignorePatterns.some(pattern => e.name === pattern || e.name.startsWith(pattern + '/'))) continue;
                const fp = path.join(p, e.name);
                try {
                    const stats = await stat(fp);
                    if (e.isDirectory()) {
                        tree += `${indent}[DIR] ${e.name}\n`;
                        tree += await build(fp, currentDepth + 1, indent + "  ");
                    } else {
                        tree += `${indent}[FILE ${formatSize(stats.size)}] ${e.name}\n`;
                    }
                } catch (err: any) {
                    tree += `${indent}[FILE ?] ${e.name}\n`;
                }
            }
            return tree;
        }
        return await build(dirPath, 0);
    } catch (error: any) { return `Error: ${error.message}`; }
}
