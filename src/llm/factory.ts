import { LlmModel } from './models/base.js';
import { OpenAIModel } from './models/openai.js';
import type { Config, PlatformConfig } from '../config/types.js';

export class LlmModelFactory {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  create(providerModel: string): LlmModel {
    const parsed = this.parseProviderModel(providerModel);
    const providerConfig = this.getProviderConfig(parsed.provider);

    switch (parsed.provider.toLowerCase()) {
      case 'openai':
        return new OpenAIModel(providerConfig, parsed.model);
      case 'ollama':
        return new OpenAIModel(providerConfig, parsed.model);
      default:
        throw new Error(`Unsupported LLM provider: ${parsed.provider}`);
    }
  }

  private parseProviderModel(providerModel: string): { provider: string; model: string } {
    const firstColon = providerModel.indexOf(':');
    if (firstColon === -1 || firstColon === providerModel.length - 1) {
      throw new Error(
        `Invalid provider:model format: ${providerModel}. Expected format: "provider:model"`
      );
    }

    const provider = providerModel.slice(0, firstColon).trim();
    const model = providerModel.slice(firstColon + 1).trim();

    if (!provider || !model) {
      throw new Error(
        `Invalid provider:model format: ${providerModel}. Both provider and model must be non-empty`
      );
    }

    return { provider, model };
  }

  private getProviderConfig(provider: string): PlatformConfig {
    switch (provider.toLowerCase()) {
      case 'openai':
        return this.config.platforms.openai!;
      case 'ollama':
        return { apiUrl: "http://localhost:11434/v1", apiKey: "dfklgh jsdfklghjldfsghjledghlsdhgl" }
      default:
        throw new Error(`${provider.toUpperCase()}_API_KEY env variable is not configured.`);
    }        
  }

  getSupportedProviders(): string[] {
    return Object.keys(this.config.platforms);
  }
}