import express from 'express';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { GetTopicContentTool } from './tools/get-topic-content.js';
import { ListTopics } from './tools/list-topics.js';
import { Logger } from '../utils/logger.js';
import { SQLiteStorage } from '../storage/sqlite.js';

const logger = new Logger('MCP');

class CryptoInsightsMcpServer {
  private app: express.Application;
  private port: number;
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage, port: number = 3001) {
    this.storage = storage;
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
  }

  private getServer(): McpServer {
    const server = new McpServer({
      name: 'contextify',
      version: '1.0.0'
    });

    const tools = [
      new ListTopics(this.storage),
      new GetTopicContentTool(this.storage)
    ];
    
    tools.forEach(tool => tool.register(server));   

    return server;
  }

  private setupRoutes(): void {
    
    this.app.post('/mcp', async (req: Request, res: Response) => {
      const requestId = Math.random().toString(36).substr(2, 9);
      const method = req.body?.method || 'unknown';

      logger.debug(`[${requestId}] Handling MCP request: ${method}`);

      try {
        const server = this.getServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless mode
        });

        // Clean up when request is closed
        res.on('close', () => {
          transport.close();
          logger.debug(`[${requestId}] Connection closed`);
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        logger.debug(`[${requestId}] Request completed successfully`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[${requestId}] MCP request failed (${method}): ${errorMessage}`);

        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
              data: { requestId, method }
            },
            id: req.body?.id || null,
          });
        }
      }
    });

    // GET not supported in stateless mode
    this.app.get('/mcp', (req: Request, res: Response) => {
      logger.warn(`Rejected GET request to /mcp from ${req.ip}`);
      res.status(405).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'GET method not allowed. Use POST for MCP requests.',
          data: { supportedMethods: ['POST'] }
        },
        id: null,
      });
    });

    // DELETE not needed in stateless mode
    this.app.delete('/mcp', (req: Request, res: Response) => {
      logger.warn(`Rejected DELETE request to /mcp from ${req.ip}`);
      res.status(405).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'DELETE method not allowed. Use POST for MCP requests.',
          data: { supportedMethods: ['POST'] }
        },
        id: null,
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`Starting MCP server on port ${this.port}`);

      this.app.listen(this.port, (error?: Error) => {
        if (error) {
          logger.error(`Failed to start MCP server on port ${this.port}: ${error.message}`);
          reject(error);
        } else {
          logger.info(`MCP Server ready on http://localhost:${this.port}/mcp`);
          resolve();
        }
      });
    });
  }
}

export { CryptoInsightsMcpServer };
