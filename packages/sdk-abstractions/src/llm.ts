// LLM provider abstraction — all calls go through LiteLLM

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: LLMTool[];
  stream?: boolean;
}

export interface LLMResponse {
  id: string;
  model: string;
  content: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  toolCalls?: LLMToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ILLMProvider {
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterable<string>;
}
