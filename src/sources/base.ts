import type { SQLiteStorage } from '../storage/sqlite.js';
import { Logger } from '../utils/logger.js';

export abstract class Fetcher {
  private START_DATE = new Date('2025-09-01');
  protected storage: SQLiteStorage;
  protected abstract logger: Logger;

  constructor(storage: SQLiteStorage) {
    if (!storage) {
      throw new Error('Storage instance is required');
    }
    this.storage = storage;
  }

  async fetch(): Promise<void> {
    const lastFetchDate = await this.storage?.getLastFetchDate(this.getSourceName(), this.getAccountName());
    const since = lastFetchDate || this.START_DATE;
    this.logger.info(`Fetching ${this.getSourceName()} content for ${this.getAccountName()} since ${since?.toISOString()}`);

    try {
      await this.fetchImpl(since);
      this.logger.info(`${this.getSourceName()} content for ${this.getAccountName()} fetched`);
    } catch (error) {
      this.logger.error(`Error fetching ${this.getSourceName()} content for ${this.getAccountName()}:`, error);
    }
  }

  abstract getSourceName(): string;
  abstract getAccountName(): string;
  protected abstract fetchImpl(since: Date): Promise<void>;

  protected async saveContent(id: string, title: string, publishDate: Date, content: string): Promise<void> {
    if (!this.storage) {
      throw new Error('Storage not initialized');
    }

    this.storage.insertRawContent({
      id,
      source: this.getSourceName(),
      account: this.getAccountName() || '',
      title,
      content,
      publishDate
    });
  }
}
