import { Logger } from './utils/logger.js';
import { DataIngestionService } from './services/data-ingestion.js';
import { TopicGenerationService } from './services/topic-generation.js';
import { SQLiteStorage } from './storage/sqlite.js';
import { CryptoInsightsMcpServer } from './mcp/server.js';
import { loadConfig } from './config/config.js';
import { LlmModelFactory } from './llm/factory.js';
import { resolve } from 'path';

const logger = new Logger('Main');

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting');

    const configPath = resolve(process.cwd(), 'config/crypto.yaml');
    const config = loadConfig(configPath);
    logger.info('✅ Configuration loaded successfully');

    const sqliteStorage = new SQLiteStorage(config.db.fileName);
    await sqliteStorage.initialize();

    const dataIngestionService = new DataIngestionService(sqliteStorage);
    dataIngestionService.initializeFromConfig(config);
    dataIngestionService.start();

    const llmFactory = new LlmModelFactory(config);
    const topicService = new TopicGenerationService(sqliteStorage, llmFactory, config);

    topicService.start();

    const mcpServer = new CryptoInsightsMcpServer(sqliteStorage, config.server.port);
    await mcpServer.start();

    logger.info('🎉 All services started successfully!');

    const gracefulShutdown = async (signal: string) => {
      logger.info(`\n🛑 Received ${signal} - shutting down gracefully...`);

      try {
        logger.info('Stopping services');
        dataIngestionService.stop();
        topicService.stop();
        await sqliteStorage.close();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    logger.error(`💥 Failed to start services: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

main();
