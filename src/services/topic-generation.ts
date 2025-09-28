import { z } from 'zod';
import type { Config } from '../config/types.js';
import type { RawContentRecord } from '../storage/models.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { LlmModelFactory } from '../llm/factory.js';
import { BaseProcessorService } from './base-processor.js';

const TopicsResponseSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string().min(1).max(120),
      content: z.string().min(1),
      keyowrds: z.string().min(1)
    })
  ).min(1)
});

type TopicsResponse = z.infer<typeof TopicsResponseSchema>;

export class TopicGenerationService extends BaseProcessorService<RawContentRecord> {
  private readonly model: string;
  private readonly systemPrompt: string;

  constructor(storage: SQLiteStorage, llmFactory: LlmModelFactory, config: Config) {
    super(storage, llmFactory, {
      serviceName: 'TopicGeneration',
      workerCount: config.processing.topics.workers
    });

    this.model = config.processing.topics.model;
    this.systemPrompt = config.processing.topics.prompt;
  }

  protected claimContent(): RawContentRecord | null {
    return this.storage.claimRawContentForTopics()
  }

  protected async processContent(content: RawContentRecord, workerId: number): Promise<void> {
    const llm = this.llmFactory.create(this.model);
    const contentTitle = this.formatContentTitle(content)

    this.logger.info(`[Worker ${workerId}] Extracting topics from '${contentTitle}'`, { model: llm.getModelName() })
    const response = await llm.complete<TopicsResponse>({
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: this.createUserPrompt(content) }
      ],
      outputFormat: {
        type: 'zod_schema',
        schema: TopicsResponseSchema,
        name: 'summary_topics'
      }
    });

    const generatedAt = new Date();
    const topics = response.parsed?.topics?.map(topic => ({
      name: topic.name.trim(),
      content: topic.content.trim(),
      keywords: topic.keyowrds,
      generatedAt,
      generatedByModel: this.model
    })).filter(topic => topic.name && topic.content);

    if (!topics || topics.length === 0) {
      throw new Error('LLM returned no topics');
    }

    const topicsList = topics.map(t => `  - ${t.name}`).join("\n")
    this.logger.info(`[Worker ${workerId}] Extracted ${topics.length} topics from '${contentTitle}':\n${topicsList}'`)
    this.storage.replaceTopics(content.id, topics);
    this.storage.setStageStatus(content.id, 'topics', 'done');
    this.logger.info(`[Worker ${workerId}] Topics saved for '${contentTitle}'`);
  }

  protected async handleTaskError(task: RawContentRecord | null, error: unknown, workerId: number): Promise<void> {
    if (task) {
      this.storage.setStageStatus(task.id, 'topics', 'error');
      this.logger.error(`[Worker ${workerId}] Topic generation failed for '${task.title}':`, error);
    } else {
      this.logger.error(`[Worker ${workerId}] Failed to claim topic task:`, error);
    }
  }

  private createUserPrompt(content: RawContentRecord): string {
    return [
      `**Source:** ${content.source}`,
      `**Account:** ${content.account}`,
      ``,
      `---`,
      ``,
      content.content
    ].join('\n');
  }

  private formatContentTitle(content: RawContentRecord): string {
    return `${content.account} | ${content.title}`
  }

  private parseKeywords(value: string | null): string[] {
    if (!value) {
      return [];
    }
    return value.split(',').map(k => k.trim()).filter(Boolean);
  }

}
