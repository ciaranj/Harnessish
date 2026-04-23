import { readFile, writeFile, readdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

export async function readLocalFile(path: string): Promise<string> {
    try { return await readFile(path, 'utf-8'); }
    catch (error: any) { return `Error reading file at "${path}": ${error.message}`; }
}

export async function writeLocalFile(path: string, content: string): Promise<string> {
    try { await writeFile(path, content, 'utf-8'); return `Successfully wrote to ${path}`; }
    catch (error: any) { return `Error writing to file at "${path}": ${error.message}`; }
}

export async function appendLocalFile(path: string, content: string): Promise<string> {
    try { await appendFile(path, content, 'utf-8'); return `Successfully appended to ${path}`; }
    catch (error: any) { return `Error: ${error.message}`; }
}

export async function replaceContentLocal(path: string, searchString: string, replacementString: string): Promise<string> {
    try {
        const content = await readFile(path, 'utf-8');
        if (!content.includes(searchString)) return `Error: Search string not found in "${path}".`;
        await writeFile(path, content.replace(searchString, replacementString), 'utf-8');
        return `Successfully replaced content in ${path}`;
    } catch (error: any) { return `Error: ${error.message}`; }
}

export async function listDirectory(dirPath: string): Promise<string> {
    try {
        const files = await readdir(dirPath, { withFileTypes: true });
        return files.map(f => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n') || "Empty.";
    } catch (error: any) { return `Error: ${error.message}`; }
}

export async function getFileTree(dirPath: string, maxDepth: number = 3, ignorePatterns: string[] = ['node_modules', '.git', 'build', 'dist']): Promise<string> {
    try {
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
                tree += `${indent}${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}\n`;
                if (e.isDirectory()) { tree += await build(fp, currentDepth + 1, indent + "  "); }
            }
            return tree;
        }
        return await build(dirPath, 0);
    } catch (error: any) { return `Error: ${error.message}`; }
}
