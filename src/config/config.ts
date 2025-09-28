import { readFileSync } from 'fs';
import * as YAML from 'yaml';
import { config as dotenvConfig } from 'dotenv';
import { Logger } from '../utils/logger.js';
import { type Config } from './types.js';

const logger = new Logger('Config');

// Load .env file if it exists
dotenvConfig({ override: false });

export function loadConfig(configPath: string): Config {
  const envPort = process.env.CONTEXTIFY_MCP_SERVER_PORT
    ? parseInt(process.env.CONTEXTIFY_MCP_SERVER_PORT, 10)
    : undefined;

  const config = loadYamlConfig(configPath);
  config.server.port = envPort || config.server?.port;

  // Initialize platforms if not present
  if (!config.platforms) config.platforms = {};

  // Load API keys from environment
  config.platforms.youtube = { apiKey: process.env.YOUTUBE_API_KEY || '' };
  config.platforms.openai = { apiKey: process.env.OPENAI_API_KEY || '' };

  console.log(config)
  return config;
}

function loadYamlConfig(configPath: string): Config {
  try {
    const fileContent = readFileSync(configPath, 'utf8');
    const config = YAML.parse(fileContent) || {};
    logger.info(`Loaded configuration from ${configPath}`);
    return config;
  } catch (error) {
    logger.error(`Failed to load config file ${configPath}:`, error);
    throw error;
  }
}

