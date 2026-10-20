/**
 * Tool definition and response types — mirrors the existing MCP server's
 * `ToolDefinition`/`ToolResponse` shape in `mcp-server/src/tools/market.ts`.
 */

export interface ToolResponse {
  content: { type: string; text: string }[];
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}