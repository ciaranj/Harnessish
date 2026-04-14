import { Buffer } from 'node:buffer';
import { loadEnvFile } from 'node:process';
import { StringDecoder } from 'node:string_decoder';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';

try { loadEnvFile(); } catch {} // silently skip if no .env exists    

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
Prefer a direct answer when no tool is needed.`;

const tools= [
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
function runPython(code, timeoutMs = 60_000) {
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

async function dispatchTool(name, args) {
    console.log(`\n[tool: ${name}] ${JSON.stringify(args)}`);
    if (name === 'python') {
        return runPython(args.code);
    }
    return `Tool "${name}" is not yet implemented.`;
}

async function makeCallToLLM( message ) {
    if (message) messageHistory.push({ role: 'user', content: message });

    const body= JSON.stringify({ model: process.env.MODEL, messages: [{"role":"system","content":systemPrompt},...messageHistory], tools:tools, stream: true, cache_prompt:true });
    const res = await fetch(`${OLLAMA_CHAT_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
    });

    var buffer = "";
    const decoder = new StringDecoder('utf8');
    let response = "";
    const toolCalls = [];
    for await (const chunk of res.body) {
        buffer += decoder.write(chunk);
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep any incomplete trailing line
        for (const line of lines) {
            if (!line.trim()) continue; // skip empty lines
            const data = line.startsWith('data: ') ? line.slice(6) : line;
            if (data === '[DONE]') break; // SSE end signal
            const payload = JSON.parse(data);
            const delta = payload.choices[0].delta;
//            const reasoningToken = delta.reasoning_content ?? '';
//            if (reasoningToken) process.stdout.write(reasoningToken);

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
                    await makeCallToLLM(null); // follow up with tool results
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
let messageHistory = [];

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

