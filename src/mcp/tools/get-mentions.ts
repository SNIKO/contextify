import { BaseTool } from './base.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SQLiteStorage } from '../../storage/sqlite.js';

export class GetMentionsTool extends BaseTool {
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    super();
    this.storage = storage;
  }

  register(server: McpServer): void {
    server.registerTool(
      "get-mentions",
      {
        description: 'Get all mentions of a specific topic (token, ticker, project, or protocol) from processed content in the last N days',
        inputSchema: z.object({
          topic: z.string().min(1).describe('Topic to search for. Must be a single word (token, ticker, project name, protocol name, etc.). Some projects maybe saved under different topics, such as ETH and Ethereum, BTC and Bitcoin. So, make a separate tool calls for each variant to be thorough.'),
          days: z.number().min(1).describe('Number of days to look back for mentions').default(7)
        }).shape,
      },
      this.handle.bind(this)
    );
  }

  private async handle(args: { topic: string; days?: number }): Promise<CallToolResult> {
    const days = args.days || 7;
    const topic = args.topic.trim();

    if (!topic) {
      return this.createTextResponse('Topic parameter cannot be empty.');
    }

    try {
      const mentions = this.storage.getMentionsByTopic(topic, days);

      if (mentions.length === 0) {
        return this.createTextResponse(`No mentions of "${topic}" found in the last ${days} days.`);
      }

      const markdown = this.formatMentionsAsMarkdown(mentions, topic, days);
      return this.createTextResponse(markdown);
    } catch (error) {
      return this.createTextResponse(`Error retrieving mentions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatMentionsAsMarkdown(mentions: any[], topic: string, days: number): string {
    const header = `# Mentions of "${topic}" in the last ${days} days\n\nFound ${mentions.length} mention${mentions.length === 1 ? '' : 's'}:\n\n`;

    // Group mentions by date
    const mentionsByDate = new Map<string, any[]>();

    mentions.forEach(mention => {
      const dateKey = new Date(mention.publish_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      if (!mentionsByDate.has(dateKey)) {
        mentionsByDate.set(dateKey, []);
      }
      mentionsByDate.get(dateKey)!.push(mention);
    });

    // Sort dates in reverse chronological order
    const sortedDates = Array.from(mentionsByDate.keys()).sort((a, b) =>
      new Date(b).getTime() - new Date(a).getTime()
    );

    const formattedSections = sortedDates.map(dateKey => {
      const dateMentions = mentionsByDate.get(dateKey)!;
      let section = `## ${dateKey}\n\n`;

      dateMentions.forEach(mention => {
        const publishTime = new Date(mention.publish_date).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const subscriberInfo = mention.subscriber_count
          ? ` - ${this.formatSubscriberCount(mention.subscriber_count)} subscribers`
          : '';

        const channelTitle = mention.channel_title || mention.account;

        section += `### @${channelTitle} (${mention.source})${subscriberInfo}\n`;
        section += `**Published**: ${publishTime}\n\n`;
        section += `${mention.content}\n\n---\n\n`;
      });

      return section;
    }).join('');

    return header + formattedSections;
  }

  private formatSubscriberCount(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    } else {
      return count.toString();
    }
  }
}
