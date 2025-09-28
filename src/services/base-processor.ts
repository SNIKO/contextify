import { Logger } from '../utils/logger.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { LlmModelFactory } from '../llm/factory.js';

interface BaseProcessorOptions {
  serviceName: string;
  workerCount: number;  
}

export abstract class BaseProcessorService<Task> {
  static readonly IDLE_DELAY_MS = 60_000;
  static readonly ERROR_DELAY_MS = 30_000;
  
  protected readonly storage: SQLiteStorage;
  protected readonly llmFactory: LlmModelFactory;
  protected readonly logger: Logger;
  private readonly workerCount: number;  
  private isRunning = false;
  private shouldStop = false;
  private workerPromises: Promise<void>[] = [];

  constructor(storage: SQLiteStorage, llmFactory: LlmModelFactory, options: BaseProcessorOptions) {
    this.storage = storage;
    this.llmFactory = llmFactory;
    this.workerCount = Math.max(1, options.workerCount);    
    this.logger = new Logger(options.serviceName);
  }

  start(): void {
    if (this.isRunning) {
      this.logger.warn('Service already running');
      return;
    }

    this.logger.info(`Starting with ${this.workerCount} worker${this.workerCount === 1 ? '' : 's'}`);
    this.shouldStop = false;
    this.isRunning = true;
    this.workerPromises = Array.from({ length: this.workerCount }, (_, index) =>
      this.runWorker(index + 1).catch(error => {
        this.logger.error(`Worker ${index + 1} crashed`, error);
      })
    );
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping');
    this.shouldStop = true;
    this.isRunning = false;
  }

  protected abstract claimContent(workerId: number): Promise<Task | null> | Task | null;

  protected abstract processContent(task: Task, workerId: number): Promise<void>;

  protected abstract handleTaskError(task: Task | null, error: unknown, workerId: number): Promise<void>;  

  private async runWorker(workerId: number): Promise<void> {
    this.logger.info(`Worker ${workerId} started`);

    while (!this.shouldStop) {
      let task: Task | null = null;

      try {
        task = await this.claimContent(workerId);

        if (!task) {
          await this.sleep(BaseProcessorService.IDLE_DELAY_MS);
          continue;
        }

        await this.processContent(task, workerId);
      } catch (error) {
        console.log(error)
        await this.handleTaskError(task, error, workerId);
        await this.sleep(BaseProcessorService.ERROR_DELAY_MS);
      }
    }

    this.logger.info(`Worker ${workerId} stopped`);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}
