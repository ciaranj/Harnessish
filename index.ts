import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

import { loadEnvFile } from 'node:process';
import { StringDecoder } from 'node:string_decoder';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
try { loadEnvFile(); } catch {} // silently skip if no .env exists    

  let mcp: Client = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  let transport: StreamableHTTPClientTransport | null = null;
  let mcpTools: any[] = [];

  async function connectToServer() {
    try {
        transport = new StreamableHTTPClientTransport(new URL("https://seolinkmap.com/mcp"));
        await mcp.connect(transport);

        const toolsResult = await mcp.listTools();
        mcpTools = toolsResult.tools.map((tool) => {
            return {
                type: "function",
                "function": {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                }
            };
        });
        console.log(
        "Connected to server with tools:",
            mcpTools.map(( mcpTool ) => mcpTool.function.name)
        );
        tools= tools.concat(mcpTools);

    } catch (e) {
        console.log("Failed to connect to MCP server: ", e);
        throw e;
    }
}  


const OLLAMA_HEALTH_URL= new URL('/health', process.env.OLLAMA_URL);
const OLLAMA_CHAT_URL= new URL('/v1/chat/completions', process.env.OLLAMA_URL);

async function healthCheck() {
    try {
        const res = await fetch(OLLAMA_HEALTH_URL);
        return res.ok;
    } catch {
        return false;
    }
}
const systemPrompt= `You may use the available tools when they are needed to answer accurately.
Use a tool when the question requires live data, account-specific data, or an external action.
Do not call tools for general knowledge or simple reasoning.
Never invent tool results.
If a required tool argument is missing, ask one concise follow-up question.
Prefer a direct answer when no tool is needed.

Avoid sycophancy at all costs`;

let tools= [
        {
            "type":"function",
            "function":{
                "name":"read_from_file",
                "description":"Read the contents of a file and return it to the context",
                "parameters": {
                    "type":"object",
                    "properties": {
                        "path": {
                            "type":"string",
                            "description":"The path to the file that needs reading"
                        }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_git_diff",
                "description": "Returns the differences between the current working directory and the last commit. Use this to see exactly what code has changed to write accurate commit messages.",
                "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                    "type": "string",
                    "description": "The specific file to check the diff for. If omitted, returns diffs for all changed files."
                    },
                    "staged": {
                    "type": "boolean",
                    "description": "If true, returns the diff of files already added to the git index (staged). If false, returns unstaged changes."
                    }
                }
                }
            }
        },
        {
        "type":"function",
        "function":{
            "name":"python",
            "description":"Runs code in an ipython interpreter and returns the result of the execution after 60 seconds.",
            "parameters":{
            "type":"object",
            "properties":{
                "code":{
                "type":"string",
                "description":"The code to run in the ipython interpreter."
                }
            },
            "required":["code"]
            }
        }
        }
];
/**
 * Executes git diff to see what has changed.
 * @param {string} path - Optional file path to filter diff.
 * @param {boolean} staged - Whether to look at staged changes (--cached).
 */
async function getGitDiff(path = '', staged = false) {
  try {
    // Determine the flag: --cached for staged, nothing for unstaged
    const flag = staged ? '--cached' : '';
    
    // Construct the command: e.g., "git diff --cached index.ts"
    const command = `git diff ${flag} ${path}`.trim();

    const { stdout, stderr } = await execAsync(command);

    // If stdout is empty, there are no changes
    if (!stdout.trim()) {
      return "No changes detected in the specified scope.";
    }

    return stdout;
  } catch (error:any) {
    // Git returns an error code if there are no changes in some environments,
    // or if it's not a git repository.
    if (error.stdout) {
      return error.stdout; // Return whatever git managed to output
    }
    return `Error running git diff: ${error.message}`;
  }
}

function runPython(code:string, timeoutMs = 60_000) {
    return new Promise((resolve) => {
        const proc = spawn('ipython', ['--no-banner', '--no-confirm-exit', '-c', code], {
            timeout: timeoutMs,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d; });
        proc.stderr.on('data', (d) => { stderr += d; });
        proc.on('close', (code) => {
            const out = stdout.trim();
            const err = stderr.trim();
            if (code !== 0 && err) resolve(`Error:\n${err}`);
            else resolve(out || '(no output)');
        });
        proc.on('error', (e) => resolve(`Failed to launch ipython: ${e.message}`));
    });
}

/**
 * Reads a local file and returns its content as a string.
 * If the file doesn't exist or can't be read, returns an error message.
 */
async function readLocalFile(path: string): Promise<string> {
    try {
        const content = await readFile(path, 'utf-8');
        return content;
    } catch (error: any) {
        return `Error reading file at "${path}": ${error.message}`;
    }
}

async function dispatchTool(name:string, args:any) {
    console.log(`\n[tool: ${name}] ${JSON.stringify(args)}`);
    if (name === 'python') {
        return runPython(args.code);
    }
    else if (name === 'read_from_file') {
        return await readLocalFile(args.path);
    }
    else if (name === 'get_git_diff') {
        return await getGitDiff(args.path, args.staged);
    } 
    else {
        const result= await mcp.callTool({
            name: name,
            arguments: args,
        });
        return JSON.stringify(result.content);
    }
    return `Tool "${name}" is not yet implemented.`;
}

async function makeCallToLLM( message:string|undefined=undefined, depth:number=0 ) {
    if( depth > 5 ) throw new Error("Too many loops"); // Naff loop detection logic to catch tool spinouts.
    if (message) messageHistory.push({ role: 'user', content: message });

    const body= JSON.stringify({ model: process.env.MODEL, messages: [{"role":"system","content":systemPrompt},...messageHistory], tools:tools, stream: true, cache_prompt:true });
    const res = await fetch(`${OLLAMA_CHAT_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
    });

    let buffer:string|undefined = "";
    const decoder = new StringDecoder('utf8');
    let response = "";
    const toolCalls = [];
    if (!res.body) throw new Error("Response body is null");
    for await (const chunk of res.body) {
        if( res.status != 200 ) {
            process.stderr.write(decoder.write(chunk));
        }
        else {
            buffer += decoder.write(chunk);
            const lines:string[]|undefined = buffer?.split('\n');
            if( lines != null ) {
                buffer = lines.pop(); // keep any incomplete trailing line
                for (const line of lines) {
                    if (!line.trim()) continue; // skip empty lines
                    const data = line.startsWith('data: ') ? line.slice(6) : line;
                    if (data === '[DONE]') break; // SSE end signal
                    const payload = JSON.parse(data);
                    const delta = payload.choices[0].delta;
    //              const reasoningToken = delta.reasoning_content ?? '';
    //                if (reasoningToken) process.stdout.write(reasoningToken);

                    if (delta.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            if (!toolCalls[tc.index]) {
                                toolCalls[tc.index] = { id: tc.id, type: tc.type, function: { name: tc.function.name, arguments: '' } };
                            }
                            toolCalls[tc.index].function.arguments += tc.function.arguments ?? '';
                        }
                    }

                    const token = delta.content ?? '';
                    if (token) {
                        response += token;
                        process.stdout.write(token);
                    }

                    if (payload.choices[0].finish_reason) {
                        process.stdout.write('\n');
                        if (payload.choices[0].finish_reason === 'stop') {
                            messageHistory.push({ role: 'assistant', content: response });
                        } else if (payload.choices[0].finish_reason === 'tool_calls') {
                            messageHistory.push({ role: 'assistant', tool_calls: toolCalls });
                            for (const tc of toolCalls) {
                                const args = JSON.parse(tc.function.arguments);
                                const result = await dispatchTool(tc.function.name, args);
                                messageHistory.push({ role: 'tool', tool_call_id: tc.id, content: String(result) });
                            }
                            await makeCallToLLM(undefined, ++depth); // follow up with tool results
                        }
                    }
                }
            }
        }
    }
    return res;
}
const ollamaOk = await healthCheck();
if(!ollamaOk) {
    console.error(`Ollama Health check failed -  ${OLLAMA_HEALTH_URL}`)
} else {
    console.info(`Ollama Located and Healthy -  ${OLLAMA_HEALTH_URL}`)
}

await connectToServer();

let messageHistory: any[] = [];

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.setPrompt('> ');
rl.prompt();

rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) { rl.prompt(); return; }
    rl.pause();
    if( text.startsWith('/') ) {
        // Some sort of command.
        if( text.startsWith('/reset')) {
            messageHistory= [];
            console.log("Session has been reset.");
        }
        else if ( text.startsWith('/exit')) {
            console.log("Byeee, thank you for chatting.");
            process.exit(0);
        }
    }
    else {
        // some sort of llm request
        await makeCallToLLM(text);
    }
    rl.resume();
    rl.prompt();
});

