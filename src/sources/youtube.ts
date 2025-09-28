import { Fetcher } from './base.js';
import type { SQLiteStorage } from '../storage/sqlite.js';
import { Logger } from '../utils/logger.js';
import { google } from 'googleapis';
import type { youtube_v3 } from 'googleapis';
import Innertube from 'youtubei.js';

interface VideoMetadata {
  source: string;
  description?: string;
  title?: string;
  view_count?: number;
  author?: string;
  transcript: string;
}

export class YouTubeDataSource extends Fetcher {
  private accountName: string;
  private youtube: youtube_v3.Youtube;
  protected logger: Logger;

  constructor(apiKey: string, accountName: string, storage: SQLiteStorage) {
    super(storage);
    this.accountName = accountName;
    this.youtube = google.youtube({ version: 'v3', auth: apiKey });
    this.logger = new Logger(`YouTube:${accountName}`);
  }

  getSourceName(): string {
    return 'youtube';
  }

  getAccountName(): string {
    return this.accountName;
  }

  protected async fetchImpl(since: Date): Promise<void> {
    const channelId = await this.getChannelId();
    if (!channelId) {
      throw new Error(`Could not find youtube channel for: ${this.accountName}`);
    }

    this.logger.info(`Searching for videos since ${since.toLocaleDateString()}`);

    const searchParams: youtube_v3.Params$Resource$Search$List = {
      part: ['id', 'snippet'],
      channelId: channelId,
      type: ['video'],
      order: 'date',
      maxResults: 50,
      publishedAfter: since.toISOString()
    };

    const searchResponse = await this.youtube.search.list(searchParams);
    const videos = searchResponse.data.items || [];

    this.logger.info(`Found ${videos.length} videos`);
    
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const validVideos = videos.filter(video =>
      video.id?.videoId && video.snippet?.title
    );

    if (validVideos.length > 0) {
      this.logger.info(`Processing ${validVideos.length} videos`);
    }

    for (const video of validVideos) {
      const videoId = video.id!.videoId!;
      const title = video.snippet!.title!;

      this.logger.info(`Processing '${title}'`);

      if (this.storage.isFetched(videoId)) {
        this.logger.info(`Skipped '${title}'. Already fetched`);
        skippedCount++;
        continue;
      }

      const videoInfo = await this.fetchVideo(videoId, title);
      if (!videoInfo) {
        errorCount++;
        continue;
      }

      await this.saveContent(
        videoId,
        title,
        new Date(video.snippet!.publishedAt || Date.now()),
        videoInfo.transcript
      );

      processedCount++;
    }

    // Summary report only if there were videos to process
    if (processedCount > 0 || skippedCount > 0 || errorCount > 0) {
      const summary = [];
      if (processedCount > 0) summary.push(`${processedCount} processed`);
      if (skippedCount > 0) summary.push(`${skippedCount} skipped`);
      if (errorCount > 0) summary.push(`${errorCount} failed`);

      this.logger.debug(`Results: ${summary.join(', ')}`);
    }
  }

  private async getChannelId(): Promise<string | null> {
    // Check cache first
    const cachedChannelId = this.storage.getCachedChannelId('youtube', this.accountName);
    if (cachedChannelId) {
      this.logger.debug(`Using cached channel ID: ${cachedChannelId}`);
      this.storage.updateChannelLastChecked('youtube', this.accountName);
      return cachedChannelId;
    }

    // Resolve and cache if not found
    this.logger.debug(`Missed cache for channel ID`);
    const channelId = await this.resolveChannelId();

    if (channelId) {
      // Get additional channel details for metadata
      const channelDetails = await this.fetchChannelDetails(channelId);
      if (!channelDetails) {
        this.logger.warn(`Could not fetch additional channel details for ${channelId}`);
        return channelId
      }

      // Store in cache
      this.storage.storeChannelMetadata({
        accountName: this.accountName,
        source: 'youtube',
        channelId: channelId,
        channelTitle: channelDetails?.title,
        subscriberCount: channelDetails?.subscriberCount,
        resolvedAt: new Date(),
        lastChecked: new Date()
      });
    }

    return channelId;
  }

  private async resolveChannelId(): Promise<string | null> {
    try {
      let cleanAccountName = this.accountName.startsWith('@') 
        ? this.accountName.substring(1) 
        : this.accountName;
      
      this.logger.debug(`Resolving channel ID`);

      const response = await this.youtube.search.list({
        part: ['snippet'],
        type: ['channel'],
        q: cleanAccountName,
        maxResults: 1
      } as youtube_v3.Params$Resource$Search$List);

      if (!response.data.items || response.data.items.length === 0) {
        this.logger.warn(`No channel found`);
        return null;
      }
      const channelId = response.data.items[0].snippet?.channelId;
      if (!channelId) {
        this.logger.warn(`No channel found`);
        return null;
      }

      this.logger.debug(`Found channel ID: ${channelId}`);
      return channelId;
    } catch (error) {
      this.logger.error(`Failed to resolve channel ID:`, error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  private async fetchVideo(videoId: string, title: string): Promise<VideoMetadata | null> {
    try {
      this.logger.debug(`Fetching metadata and transcript for video '${title}'`);

      const youtube = await Innertube.create({
        lang: "en",
        retrieve_player: false,
      });

      const info = await youtube.getInfo(videoId);
      const transcriptData = await info.getTranscript();

      if (!transcriptData?.transcript?.content?.body?.initial_segments) {
        throw new Error(`No transcript segments available for video '${title}'`);
      }

      const transcript = transcriptData.transcript.content.body.initial_segments
        .map((segment) => segment.snippet.text)
        .join(" ");

      if (!transcript || transcript.trim().length === 0) {
        this.logger.warn(`Video '${title}' skipped due to empty transcript`);
        return null;
      }

      const basicInfo = info.basic_info;
      const metadata: VideoMetadata = {
        source: videoId,
        transcript: transcript,
        description: basicInfo.short_description,
        title: basicInfo.title,
        view_count: basicInfo.view_count,
        author: basicInfo.author
      };

      this.logger.debug(`Retrieved transcript (${transcript.length} chars) for video '${basicInfo.title}'`);
      return metadata;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(`Failed to fetch video '${title}': ${errorMessage}`);
      return null;
    }
  }

  private async fetchChannelDetails(channelId: string): Promise<{ title?: string; subscriberCount?: number } | null> {
    try {
      const response = await this.youtube.channels.list({
        part: ['snippet', 'statistics'],
        id: [channelId],
        maxResults: 1
      } as youtube_v3.Params$Resource$Channels$List);

      if (!response.data.items || response.data.items.length === 0) {
        return null;
      }

      const channel = response.data.items[0];
      return {
        title: channel.snippet?.title || undefined,
        subscriberCount: channel.statistics?.subscriberCount
          ? parseInt(channel.statistics.subscriberCount)
          : undefined
      };
    } catch (error) {
      this.logger.debug(`Failed to get channel details for ${channelId}:`, error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }
}
