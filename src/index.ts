#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { logger } from './utils/logger.js';
import { greetCommand } from './commands/greet.js';

interface CommandArgs {
  command: string | undefined;
  name: string | undefined;
  verbose: boolean | undefined;
  help: boolean | undefined;
}

function showHelp(): void {
  console.log(`
Emily - A TypeScript Console Application

Usage: emily [command] [options]

Commands:
  greet [name]    Greet someone (default: World)

Options:
  -v, --verbose   Enable verbose logging
  -h, --help      Show this help message

Examples:
  emily greet
  emily greet Alice
  emily greet --verbose
`);
}

function main(): void {
  try {
    const { values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        verbose: {
          type: 'boolean',
          short: 'v',
        },
        help: {
          type: 'boolean',
          short: 'h',
        },
      },
      allowPositionals: true,
    });

    const args: CommandArgs = {
      command: positionals[0],
      name: positionals[1],
      verbose: values.verbose,
      help: values.help,
    };

    if (args.verbose) {
      logger.setLevel('debug');
    }

    if (args.help) {
      showHelp();
      return;
    }

    logger.debug('Starting Emily application', { args });

    switch (args.command) {
      case 'greet':
        greetCommand(args.name || 'World');
        break;
      case undefined:
        logger.info('Welcome to Emily! Use --help for available commands.');
        break;
      default:
        logger.error(`Unknown command: ${args.command}`);
        logger.info('Use --help to see available commands.');
        process.exit(1);
    }
  } catch (error) {
    logger.error('Application error:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}