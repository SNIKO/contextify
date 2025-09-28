import { BaseTool } from './base.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SQLiteStorage } from '../../storage/sqlite.js';

export class GetTopicContentTool extends BaseTool {
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    super();
    this.storage = storage;
  }

  register(server: McpServer): void {
    server.registerTool(
      'get-topic-content',
      {
        description: `Use this tool to retrieve content of interesting topics provided by list-topics tool. 
        You MUST not call the tool if you don't have valid IDs.`,
        inputSchema: z
          .object({
            ids: z
              .array(
                z
                  .number()
                  .int()
                  .positive()                
              )
              .min(1)
              .describe('List of topic IDs to retrieve. Call list-topics tool to get IDs.')
          })
          .shape
      },
      this.handle.bind(this)
    );
  }

  private async handle(args: { ids: number[] }): Promise<CallToolResult> {
    const topicIds = Array.from(new Set(args.ids.map(id => Math.trunc(id))));

    if (topicIds.length === 0) {
      return this.createTextResponse('No topic IDs provided.');
    }

    try {
      const records = this.storage.getTopicsByIds(topicIds);
      if (records.length === 0) {
        return this.createTextResponse(
          `No topics found for IDs: ${topicIds.join(', ')}.`
        );
      }

      const recordMap = new Map(records.map(record => [record.topicId, record]));
      const groupOrder: string[] = [];
      const grouped = new Map<string, {
        header: string;
        topics: Array<{ title: string; content: string }>;
      }>();
      const missingSections: string[] = [];

      // Group topics by account and date, i.e. if they come from the same post or video
      topicIds.forEach(id => {
        const record = recordMap.get(id);
        if (!record) {
          missingSections.push(`## Topic ${id}\n_Not found._`);
          return;
        }

        const publishDate = record.publishDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: '2-digit'
        });

        const subscriberLabel =
          typeof record.subscriberCount === 'number'
            ? record.subscriberCount.toLocaleString('en-US')
            : 'Unknown';

        const header = `## ${publishDate} | ${record.source} | ${record.account} | ${subscriberLabel} subscribers`;
        const key = `${publishDate}|${record.account}`;

        if (!grouped.has(key)) {
          grouped.set(key, { header, topics: [] });
          groupOrder.push(key);
        }

        grouped.get(key)?.topics.push({
          title: record.topicTitle,
          content: record.content
        });
      });

      const sections: string[] = [];
      groupOrder.forEach(key => {
        const group = grouped.get(key);
        if (!group) {
          return;
        }
        const topicsMarkdown = group.topics
          .map(topic => `### ${topic.title}\n${topic.content}`)
          .join('\n\n');
        sections.push(`${group.header}\n\n${topicsMarkdown}`);
      });

      sections.push(...missingSections);

      const markdown = sections.length > 0
        ? sections.join('\n\n---\n\n')
        : 'No topics matched the provided IDs.';
      return this.createTextResponse(markdown);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.createTextResponse(`Error retrieving topic content: ${message}`);
    }
  }
}
