import { loadEnvFile } from 'node:process';

loadEnvFile();

export const OLLAMA_HEALTH_URL = new URL('/health', process.env.OLLAMA_URL!);
export const OLLAMA_CHAT_URL = new URL('/v1/chat/completions', process.env.OLLAMA_URL!);
export const SEARXNG_URL = process.env.SEARXNG_URL;

export const systemPrompt = `You may use the available tools when they are needed to answer accurately.
Use a tool when the question requires live data, account-specific data, or an external action.
Do not call tools for general knowledge or simple reasoning.
Never invent tool results.
* If a required tool argument is missing, ask one concise follow-up question.
* Prefer a direct answer when no tool is needed.
* If you need to make a choice, ask which one to choose

Avoid sycophancy at all costs`;
