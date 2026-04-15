# Sample MCP Client

A Model Context Protocol (MCP) client that connects to local and remote MCP servers and integrates with OpenAI's API to process queries using server-provided tools.

## How to Run

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Build the project:**
   ```bash
   pnpm run build
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

4. **Run the client:**
   ```bash
   node --env-file=.env dist/index.js <server_endpoint> <connection_type>
   ```

## How to Connect to MCP Servers

### Connect to Local MCP Server

```bash
node --env-file=.env dist/index.js ./path/to/server.js local
```

Supported formats:
- `.js` files (Node.js scripts)
- `.py` files (Python scripts - requires Python 3)

### Connect to Remote MCP Server

```bash
node --env-file=.env dist/index.js http://localhost:3333/sse remote
```

Use the full HTTP/HTTPS URL of your remote MCP server's SSE endpoint.
