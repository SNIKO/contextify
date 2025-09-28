// import { logger } from "./utils/logger.js";
// import { YouTubeDataSource } from "./sources/youtube.js";
// import { YoutubeTranscriptLoader } from './loaders/youtube-transcript.js';

import { SQLiteStorage } from "./storage/sqlite.js";
import { loadConfig } from './config/config.js';
import { resolve } from 'path';
import { GetTopicsTool } from "./mcp/tools/get-topics.js";

console.log("Testing script started");

async function main(): Promise<void> {    
    const configPath = resolve(process.cwd(), 'config/crypto.yaml');
    const config = loadConfig(configPath);    

    const sqliteStorage = new SQLiteStorage(config.db.fileName);
    await sqliteStorage.initialize();
    
    const postsTool = new GetTopicsTool(sqliteStorage);
    const topics = await postsTool.handle({ days: 5 });

    console.log(topics.content[0].text.length)
    console.log(topics.content[0].text);

    // const youTubeDataSource = new YouTubeDataSource("AIzaSyAZaXHM31EiUpT_6epkL4VpXfmPFrO3Pqk", "@keddr", sqliteStorage);
    // const content = await youTubeDataSource.fetch();
    // logger.info("Fetched YouTube content:", content);
}

main()
