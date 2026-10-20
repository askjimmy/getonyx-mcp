/**
 * Tool registration for wallet-mcp-server.
 *
 * Mirrors the pattern in `mcp-server/src/tools/index.ts`.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { walletTools, handleWalletTool } from './wallet.js';

const allTools = walletTools;

const toolHandlers: Record<string, (name: string, args: Record<string, any>) => Promise<any>> = {
  ...walletTools.reduce(
    (acc, t) => ({ ...acc, [t.name]: handleWalletTool }),
    {},
  ),
};

function createServer(): Server {
  const server = new Server(
    {
      name: 'wallet-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers[name];

    if (!handler) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await handler(name, args as Record<string, any>);
      return result;
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export { createServer, allTools };
