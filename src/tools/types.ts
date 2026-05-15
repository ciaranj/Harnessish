import React from 'react';

import type { GuardrailConfigManager } from '../core/config/index.js';
import type { SessionStore } from '../core/session.js';

export interface ToolCallContext {
  abortSignal?: AbortSignal;
  guardrails?: GuardrailConfigManager;
  sessionStore?: SessionStore;
  configStore?: GuardrailConfigManager;
}

export interface Tool<TArgs, TResult> {
  name: string;
  description: string;
  schema: object;
  execute: (args: TArgs, ctx?: ToolCallContext) => Promise<TResult>;
  renderCall?: (args: TArgs) => React.ReactNode;
  renderResult?: (result: TResult) => React.ReactNode;
  renderCallText?: (args: TArgs) => string;
}

export function toolToOpenAITool<TArgs, TResult>(tool: Tool<TArgs, TResult>): any {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema
    }
  };
}

export function toolsToOpenAITools<TArgs, TResult>(tools: Tool<TArgs, TResult>[]): any[] {
  return tools.map(toolToOpenAITool);
}

export type { ToolCallContext as ToolCtx };
