import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import OpenAI from "openai";
import { FunctionTool } from "openai/resources/beta.js";
import readline from "readline/promises";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

class MCPClient {
  private mcp: Client;
  private openai: OpenAI;
  private transport:
    | StdioClientTransport
    | SSEClientTransport
    | null = null;
  private tools: FunctionTool[] = [];

  constructor() {
    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }
  // methods will go here

  async connectToServer(serverScriptPath: string, serverType: "local" | "remote") {
    if(serverType === "local") {
      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        throw new Error("Server script must be a .js or .py file");
      }
      const command = isPy
        ? process.platform === "win32"
          ? "python"
          : "python3"
        : process.execPath;

      // Transport - STDIO
      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
    }

    else if(serverType === "remote" ) {
      // Streamable http transport
      const url = new URL(serverScriptPath);
      this.transport = new SSEClientTransport(url);
    }

    try {
      await this.mcp.connect(this.transport as Transport); // connects to mcp server

      const toolsResult = await this.mcp.listTools(); // gets tools list from mcp server
      // console.error("Tools Result", toolsResult);
      this.tools = toolsResult.tools.map((tool) => {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            // strict: true,
          },
        };
      });
      // console.error("Tools:", this.tools);
    } catch (e) {
      console.error("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async processQuery(query: string) {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are a smart chatbot. You have access to following mcp tools:
        ${this.tools.map((tool) => tool.function.name).join("\n")}`,
      },
      {
        role: "user",
        content: query,
      },
    ];

    const response = await this.openai.chat.completions.create({
      model: "gpt-5.1",
      messages,
      tools: this.tools,
    });

    const finalText = [];

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    if (assistantMessage.content) {
      finalText.push(assistantMessage.content);
    }

    // Check if tool call required
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== "function") {
          continue;
        }
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        finalText.push(
          `[Calling tool ${toolName}- with args: ${toolCall.function.arguments}]`,
        );

        // calls the MCP server throgh JSON rpc
        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.content as unknown as string,
        });
      }

      const followupResponse = await this.openai.chat.completions.create({
        model: "gpt-5.1",
        messages,
      });

      if (followupResponse.choices[0].message.content) {
        finalText.push(followupResponse.choices[0].message.content);
      }
    }

    return finalText.join("\n");
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    await this.mcp.close();
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node index.ts <path_to_server_script>");
    return;
  }
  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(process.argv[2], process.argv[3] as "local" | "remote");
    await mcpClient.chatLoop();
  } catch (e) {
    console.error("Error:", e);
    await mcpClient.cleanup();
    process.exit(1);
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();
