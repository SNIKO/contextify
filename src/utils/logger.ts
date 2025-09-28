import chalk from 'chalk';
import * as cliProgress from 'cli-progress';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel = 'debug';
  private name: string;
  private activeProgress: cliProgress.SingleBar | null = null;

  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(name: string, level: LogLevel = 'debug') {
    this.name = name;
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const levelStr = level.toUpperCase().padEnd(5);
    const nameStr = chalk.dim(`[${this.name}]`);
    const formattedArgs = args.length > 0 ? ` ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')}` : '';

    const levelColor = {
      debug: chalk.gray,
      info: chalk.blue,
      warn: chalk.yellow,
      error: chalk.red,
    }[level];

    return `${chalk.dim(timestamp)} ${levelColor(levelStr)} ${nameStr} ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, ...args));
    }
  }


  // Progress bar for batch operations
  createProgress(total: number, title: string): cliProgress.SingleBar {
    this.activeProgress = new cliProgress.SingleBar({
      format: `${chalk.blue(title)} ${chalk.cyan('{bar}')} {percentage}% | {value}/{total} | ETA: {eta}s`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
    });
    this.activeProgress.start(total, 0);
    return this.activeProgress;
  }

  stopProgress(): void {
    if (this.activeProgress) {
      this.activeProgress.stop();
      this.activeProgress = null;
    }
  }


  // Async wrapper for operations with simple logging
  async withOperation<T>(
    startMessage: string,
    operation: () => Promise<T>,
    options?: {
      successMessage?: string | ((result: T) => string);
      failMessage?: string;
    }
  ): Promise<T> {
    this.info(startMessage);
    try {
      const result = await operation();
      const successMsg = typeof options?.successMessage === 'function'
        ? options.successMessage(result)
        : options?.successMessage;
      if (successMsg) {
        this.info(successMsg);
      }
      return result;
    } catch (error) {
      const failMsg = options?.failMessage || `${startMessage} failed`;
      this.error(`${failMsg}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Async wrapper for batch operations with progress tracking
  async withProgress<T>(
    title: string,
    items: T[],
    operation: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    const progress = this.createProgress(items.length, title);

    try {
      for (let i = 0; i < items.length; i++) {
        await operation(items[i], i);
        progress.increment();
      }
    } finally {
      this.stopProgress();
    }
  }
}

export { Logger };
export type { LogLevel };
