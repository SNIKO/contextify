import { BaseTool } from './base.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SQLiteStorage } from '../../storage/sqlite.js';

export class GetPostsTool extends BaseTool {  
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    super();
    this.storage = storage;
  }

  register(server: McpServer): void {
    server.registerTool(
      "get-posts",
      {
        description: 'Get all crypto influencer posts from the last N days, ordered by publish date, with topics discussed in each post',
        inputSchema: z.object({
          days: z.number().min(1).describe('Number of days to look back for posts').default(7)
        }).shape,
      },
      this.handle.bind(this)
    );
  }

  async handle(args: { days?: number }): Promise<CallToolResult> {
    const days = args.days || 7;
    
    try {
      const posts = this.storage.getPostsByDateRange(days);
      
      if (posts.length === 0) {
        return this.createTextResponse(`No posts found in the last ${days} days.`);
      }

      const markdown = this.formatPostsAsMarkdown(posts, days);
      return this.createTextResponse(markdown);
    } catch (error) {
      return this.createTextResponse(`Error retrieving posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatPostsAsMarkdown(posts: any[], days: number): string {
    const header = `# Posts from the last ${days} days\n\nFound ${posts.length} post${posts.length === 1 ? '' : 's'} (ordered by publish date):\n\n`;

    const formattedPosts = posts.map(post => {
      const publishDate = post.publishDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const topicsText = post.topics && post.topics.length > 0
        ? `**Topics**: ${post.topics.join(', ')}`
        : '**Topics**: None identified';

      return `## @${post.account} (${post.source}) | ${publishDate}\n**Title**: ${post.title || 'Untitled'}\n${topicsText}\n\n---\n`;
    }).join('\n');

    return header + formattedPosts;
  }
}
