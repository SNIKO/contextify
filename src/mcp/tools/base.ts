import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export abstract class BaseTool {
  abstract register(server: McpServer): void;

  protected createTextResponse(text: string): CallToolResult {
    return { content: [{ type: "text", text }] };
  }
}