import { logger } from '../utils/logger.js';

export function greetCommand(name: string): void {
  logger.debug(`Executing greet command for: ${name}`);

  const greeting = `Hello, ${name}!`;
  console.log(greeting);

  logger.debug('Greet command completed successfully');
}
