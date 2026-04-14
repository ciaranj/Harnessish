import { Buffer } from 'node:buffer';
import { loadEnvFile } from 'node:process';
import { StringDecoder } from 'node:string_decoder';
import { createInterface } from 'node:readline';

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
async function makeCallToLLM( message ) {
    messageHistory.push({ role: 'user', content: message });

    const body= JSON.stringify({ model: process.env.MODEL, messages: [{"role":"system","content":systemPrompt},...messageHistory], tools:tools, stream: true, cache_prompt:true });
    const res = await fetch(`${OLLAMA_CHAT_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
    });

    var buffer = "";
    const decoder = new StringDecoder('utf8');
    let response= "";
    for await (const chunk of res.body) {
        buffer += decoder.write(chunk);
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep any incomplete trailing line
        for (const line of lines) {
            if (!line.trim()) continue; // skip empty lines
            const data = line.startsWith('data: ') ? line.slice(6) : line;
            if (data === '[DONE]') break; // SSE end signal
            const payload = JSON.parse(data);
            const token = payload.choices[0].delta.content ?? '';
//            const reasoningToken = payload.choices[0].delta.reasoning_content ?? '';
            if (token) {
                 response += token;
                 process.stdout.write(token); 
            } else {
                            console.log(JSON.stringify(payload.choices[0].delta))

            }
//            if (reasoningToken) process.stdout.write(reasoningToken);
            if ( payload.choices[0].finish_reason ) {
                if( payload.choices[0].finish_reason == "stop" ) {
                    messageHistory.push({ role: 'assistant', content: response });
                }
                else if( payload.choices[0].finish_reason == "tool_calls" ) {
                    console.log( response );
                }
                console.log( `>>${payload.choices[0].finish_reason}<<` )
                process.stdout.write('\n');
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

