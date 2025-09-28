import { BaseTool } from './base.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SQLiteStorage } from '../../storage/sqlite.js';

type TopicMention = ReturnType<SQLiteStorage['getTopicsByDateRange']>[number];

export class GetTopicsTool extends BaseTool {
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    super();
    this.storage = storage;
  }

  register(server: McpServer): void {
    server.registerTool(
      'get-topics',
      {
        description:
          'List all topics mentioned in content published during the last N days, including account and platform details.',
        inputSchema: z
          .object({
            days: z
              .number()
              .int()
              .min(1)
              .describe('Number of days to look back for topic mentions.')
              .default(7),
            account: z
              .string()
              .min(1)
              .describe('Optional account handle to filter by. If not specified, topics from all acounts will be returend.')
              .optional()
          })
          .shape
      },
      this.handle.bind(this)
    );
  }

  private async handle(args: { days?: number; account?: string }): Promise<CallToolResult> {
    const days = args.days ?? 7;
    const rawAccount = args.account?.trim();
    const strippedAccount = rawAccount ? rawAccount.replace(/^@+/, '') : undefined;
    const normalizedAccount = strippedAccount && strippedAccount.length > 0
      ? strippedAccount.toLowerCase()
      : undefined;
    const displayAccount = normalizedAccount
      ? (rawAccount?.startsWith('@') ? rawAccount : `@${rawAccount}`)
      : undefined;

    try {
      const topics = this.storage.getTopicsByDateRange(days, normalizedAccount);

      if (topics.length === 0) {
        if (displayAccount) {
          return this.createTextResponse(
            `No topics found in the last ${days} days for account ${displayAccount}.`
          );
        }
        return this.createTextResponse(`No topics found in the last ${days} days.`);
      }

      const markdown = this.formatTopicsAsCsv(topics, days, displayAccount);
      return this.createTextResponse(markdown);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.createTextResponse(`Error retrieving topics: ${message}`);
    }
  }

  private formatTopicsAsCsv(
    topics: TopicMention[],
    days: number,
    accountLabel?: string
  ): string {
    const headerLines = [`# Topics from the last ${days} days`];
    if (accountLabel) {
      headerLines.push(`Account filter: ${accountLabel}`);
    }
    headerLines.push(`Total mentions: ${topics.length}`, '');
    const header = headerLines.join('\n');

    const csvHeader = this.toCsvRow([
      'topic_id',
      'topic_name',
      'account',
      'platform',
      'channel_title',
      'subscriber_count',
      'mentioned_at'
    ]);

    const csvRows = [...topics]
      .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime())
      .map(mention =>
        this.toCsvRow([
          mention.topicId,
          mention.topicName,
          mention.account,
          mention.source,
          mention.subscriberCount ?? '',
        mention.publishDate
        ? mention.publishDate.toLocaleString('en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false})
        : ''
        ])
      )
      .join('\n');

    return `${header}\`\`\`csv\n${csvHeader}\n${csvRows}\n\`\`\``;
  }

  private toCsvRow(values: Array<string | number | Date | null>): string {
    return values
      .map(value => {
        if (value === null) {
          return '';
        }

        const stringValue = value instanceof Date ? value.toISOString() : String(value);
        const needsEscaping = /[",\n]/.test(stringValue);
        if (!needsEscaping) {
          return stringValue;
        }

        return `"${stringValue.replace(/"/g, '""')}"`;
      })
      .join(',');
  }
}

