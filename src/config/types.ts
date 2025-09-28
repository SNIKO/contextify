export interface Config {
  server: {
    port: number;
  };
  sources: {
    youtube: string[];
    telegram: string[];
    twitter: string[];
  };
  processing: ProcessingConfig;
  platforms: PlatformsConfig;
  db: DatabaseConfig;
}

export interface DatabaseConfig {
  fileName: string;
}

export interface ProcessingConfig {
  summary: ProcessingStep;
  topics: ProcessingStep;
  keywords: ProcessingStep;
}

export interface ProcessingStep {
  model: string;
  workers: number;
  prompt: string;
}

export interface PlatformsConfig {
  youtube?: PlatformConfig;
  openai?: PlatformConfig;
}

export interface PlatformConfig {
  apiUrl: string;
  apiKey: string;  
}
