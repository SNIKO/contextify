import { Fetcher } from '../sources/base.js';
import { YouTubeDataSource } from '../sources/youtube.js';
import type { Config } from '../config/types.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('DataIngestion');

export class DataIngestionService {
  private dataSources: Fetcher[] = [];
  private timer: NodeJS.Timeout | undefined;
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    this.storage = storage;
  }

  initializeFromConfig(config: Config): void {
    logger.info('Initializing data sources');

    config.sources.youtube.forEach(account => {
      const apiKey = config.platforms.youtube?.apiKey || undefined;
      if (!apiKey) {
        logger.warn(`Skipping YouTube source ${account} - no API key provided`);
        return;
      }

      const source = new YouTubeDataSource(apiKey, account, this.storage, new Date('2024-01-01'));
      this.dataSources.push(source);
      logger.info(`Added data source ${source.getSourceName()}:${source.getAccountName()}`);
    });

    logger.info(`Initialized ${this.dataSources.length} data sources successfully`);
  }

  start(): void {
    logger.info(`Starting data ingestion for ${this.dataSources.length} sources`);
    this.startSourceTimer(this.dataSources);
    logger.info('Data ingestion service started - next fetch cycle will begin immediately');
  }

  stop(): void {
    logger.info('Stopping data ingestion service');
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    logger.info('Data ingestion service stopped');
  }

  private startSourceTimer(sources: Fetcher[]): void {
    const fetchAndScheduleNext = async () => {
      logger.info(`Starting fetch cycle for ${sources.length} sources`);

      let successCount = 0;
      let failCount = 0;

      for (const source of sources) {
        const label = `${source.getSourceName()}:${source.getAccountName()}`;
        try {
          logger.info(`Fetching ${label}`);
          await source.fetch();
          logger.info(`Completed fetch for ${label}`);
          successCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Fetch failed for ${label}: ${errorMessage}`);
          failCount++;
        }
      }

      const nextFetchTime = new Date(Date.now() + 3600000 * 10).toLocaleTimeString();
      logger.info(`Fetch cycle complete: ${successCount} successful, ${failCount} failed - next cycle at ${nextFetchTime}`);

      // Schedule next fetch in 10 hours
      this.timer = setTimeout(fetchAndScheduleNext, 3600000 * 10);
    };

    // Start immediately
    fetchAndScheduleNext();
  }
}
