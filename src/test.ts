// import { logger } from "./utils/logger.js";
// import { YouTubeDataSource } from "./sources/youtube.js";
// import { YoutubeTranscriptLoader } from './loaders/youtube-transcript.js';

import { SQLiteStorage } from "./storage/sqlite.js";
import { loadConfig } from './config/config.js';
import { resolve } from 'path';
import { ListTopics } from "./mcp/tools/list-topics.js";
import { GetTopicContentTool } from "./mcp/tools/get-topic-content.js";

console.log("Testing script started");

async function main(): Promise<void> {    
    const configPath = resolve(process.cwd(), 'config/crypto.yaml');
    const config = loadConfig(configPath);    

    const sqliteStorage = new SQLiteStorage(config.db.fileName);
    await sqliteStorage.initialize();
    
    const postsTool = new GetTopicContentTool(sqliteStorage)
    const topics = await postsTool.handle({ ids: [1, 100, 200, 300, 400] });

    console.log(topics.content[0].text.length);
    console.log(topics.content[0].text);
}

main()
