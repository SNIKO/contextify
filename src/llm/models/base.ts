import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmOutputFormat
} from '../types.js';
import type { PlatformConfig } from '../../config/types.js';

export abstract class LlmModel {
  protected config: PlatformConfig;
  protected modelName: string;

  constructor(config: PlatformConfig, modelName: string) {
    this.config = config;
    this.modelName = modelName;
  }

  abstract complete<T = any>(request: LlmCompletionRequest): Promise<LlmCompletionResponse<T>>;

  getModelName(): string {
    return this.modelName;
  }

  protected validateRequest(request: LlmCompletionRequest): void {
    if (!request.messages || request.messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }

    for (const message of request.messages) {
      if (!message.role || !['system', 'user', 'assistant', 'tool'].includes(message.role)) {
        throw new Error(`Invalid message role: ${message.role}`);
      }
      if (typeof message.content !== 'string') {
        throw new Error('Message content must be a string');
      }
    }

    if (request.tools) {
      for (const tool of request.tools) {
        if (tool.type !== 'function') {
          throw new Error(`Unsupported tool type: ${tool.type}`);
        }
        if (!tool.function.name || !tool.function.description) {
          throw new Error('Tool function must have name and description');
        }
      }
    }

    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
      throw new Error('Temperature must be between 0 and 2');
    }

    if (request.maxTokens !== undefined && request.maxTokens <= 0) {
      throw new Error('Max tokens must be positive');
    }

    this.validateOutputFormat(request.outputFormat);
  }

  protected validateOutputFormat(outputFormat?: LlmOutputFormat): void {
    if (!outputFormat || typeof outputFormat === 'string') {
      return;
    }

    if (outputFormat.type === 'json_schema') {
      if (!outputFormat.schema || typeof outputFormat.schema !== 'object') {
        throw new Error('JSON schema output format requires a valid schema object');
      }
    } else if (outputFormat.type === 'zod_schema') {
      if (!outputFormat.schema || typeof outputFormat.schema !== 'object') {
        throw new Error('Zod schema output format requires a valid Zod schema');
      }
    } else {
      throw new Error(`Unsupported output format type: ${(outputFormat as any).type}`);
    }
  }
}