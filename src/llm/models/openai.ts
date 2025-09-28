import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { LlmModel } from './base.js';
import type {
  LlmCompletionRequest,
  LlmCompletionResponse,  
  LlmMessage,
  LlmTool,
  LlmToolCall,
  LlmOutputFormat
} from '../types.js';
import type { PlatformConfig } from '../../config/types.js';

export class OpenAIModel extends LlmModel {
  private client: OpenAI;

  constructor(config: PlatformConfig, modelName: string) {
    super(config, modelName);

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiUrl
    });
  }

  async complete<T = any>(request: LlmCompletionRequest): Promise<LlmCompletionResponse<T>> {
    this.validateRequest(request);

    const messages = this.convertMessages(request.messages);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    // Handle structured outputs with Zod schema
    if (request.outputFormat && typeof request.outputFormat === 'object' && request.outputFormat.type === 'zod_schema') {
      const completion = await this.client.chat.completions.parse({
        model: this.modelName,
        messages,
        tools,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        response_format: zodResponseFormat(
          request.outputFormat.schema,
          request.outputFormat.name || 'response'
        ),
      });

      const choice = completion.choices[0];
      if (!choice) {
        throw new Error('No completion choice returned from OpenAI');
      }

      const toolCalls = this.extractToolCalls(choice.message.tool_calls);

      return {
        content: choice.message.content,
        toolCalls,
        finishReason: this.mapFinishReason(choice.finish_reason),
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        } : undefined,
        parsed: choice.message.parsed as T,
      };
    }

    // Handle regular completions with optional JSON schema or json_object
    const responseFormat = this.buildResponseFormat(request.outputFormat);
    const completion = await this.client.chat.completions.create({
      model: this.modelName,
      messages,
      tools,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      response_format: responseFormat,
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error('No completion choice returned from OpenAI');
    }

    const toolCalls = this.extractToolCalls(choice.message.tool_calls);

    return {
      content: choice.message.content,
      toolCalls,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
    };
  }

  private convertMessages(messages: LlmMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      switch (msg.role) {
        case 'system':
          return { role: 'system', content: msg.content };
        case 'user':
          return { role: 'user', content: msg.content };
        case 'assistant':
          return { role: 'assistant', content: msg.content };
        case 'tool':
          return {
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.toolCallId || '',
          };
        default:
          throw new Error(`Unsupported message role: ${msg.role}`);
      }
    });
  }

  private convertTools(tools: LlmTool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  private buildResponseFormat(outputFormat?: LlmOutputFormat): OpenAI.Chat.Completions.ChatCompletionCreateParams['response_format'] {
    if (!outputFormat || outputFormat === 'text') {
      return undefined;
    }

    if (outputFormat === 'json_object') {
      return { type: 'json_object' };
    }

    if (typeof outputFormat === 'object' && outputFormat.type === 'json_schema') {
      return {
        type: 'json_schema',
        json_schema: {
          name: outputFormat.name || 'response',
          schema: outputFormat.schema,
          strict: outputFormat.strict ?? true,
        },
      };
    }

    return undefined;
  }

  private extractToolCalls(toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]): LlmToolCall[] | undefined {
    return toolCalls?.map(tc => {
      if (tc.type === 'function') {
        return {
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        };
      }
      throw new Error(`Unsupported tool call type: ${tc.type}`);
    });
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}