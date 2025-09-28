import type { ZodSchema } from 'zod';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface LlmTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface JsonSchemaOutputFormat {
  type: 'json_schema';
  schema: Record<string, any>;
  name?: string;
  strict?: boolean;
}

export interface ZodSchemaOutputFormat {
  type: 'zod_schema';
  schema: ZodSchema<any>;
  name?: string;
}

export type LlmOutputFormat =
  | 'text'
  | 'json_object'
  | JsonSchemaOutputFormat
  | ZodSchemaOutputFormat;

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  tools?: LlmTool[];
  outputFormat?: LlmOutputFormat;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmCompletionResponse<T = any> {
  content: string | null;
  toolCalls?: LlmToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  parsed?: T;
}