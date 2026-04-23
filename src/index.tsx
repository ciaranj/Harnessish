import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { makeCallToLLM } from './core/llm.js';

async function main() {
    render(<App makeCallToLLM={makeCallToLLM} />);
}

main();
