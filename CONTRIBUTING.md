# Contributing to TimeZest MCP Server

Thank you for considering contributing to the TimeZest MCP Server!

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/WYRE-AI/timezest-mcp.git
   cd timezest-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up local SDK dependency**
   For local development, the package.json references the local SDK:
   ```json
   "@wyre-technology/node-timezest": "file:../node-timezest"
   ```
   Make sure the SDK is built first.

4. **Build and test**
   ```bash
   npm run build
   npm test
   ```

5. **Run locally**
   ```bash
   TIMEZEST_API_TOKEN=your-token npm run dev
   ```

## Architecture Guidelines

### MCP Server Patterns
- **Per-request instances**: Create fresh server+transport for each HTTP request (gateway mode)
- **Stateless design**: No shared state between requests
- **Decision-tree navigation**: Organize tools by domain with explicit navigation
- **Structured logging**: All logs to stderr, never stdout (MCP protocol)

### Domain Organization
Each domain handler should:
- Export tool definitions via `getTools()`
- Handle tool calls via `handleCall()`
- Include a `back` tool to return to navigation
- Log operations for debugging
- Handle errors gracefully

### Error Handling
- Catch all exceptions in tool handlers
- Return structured error responses with `isError: true`
- Log errors with context for debugging
- Never let uncaught exceptions crash the server

### Elicitation Support
- Use elicitation helpers for user interaction
- Always provide fallback behavior if elicitation fails
- Wrap elicitation in try/catch blocks
- Confirm destructive operations

## Adding New Domains

1. **Create domain handler** in `src/domains/`
2. **Register in domain index** (`src/domains/index.ts`)
3. **Add navigation entry** in navigation handler
4. **Update documentation** and tests

Example domain structure:
```typescript
// src/domains/new-domain.ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';

function getTools(): Tool[] {
  return [
    // Tool definitions
  ];
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  // Implementation
}

export const newDomainHandler: DomainHandler = { getTools, handleCall };
```

## Code Guidelines

### TypeScript
- Use strict TypeScript configuration
- Prefer interfaces over type aliases for extensibility
- Use readonly arrays and objects where appropriate
- Avoid `any` - use proper typing

### Async/Await
- Always use async/await over Promises
- Handle errors with try/catch blocks
- Use proper timeout handling for external calls

### Client Management
- Use the singleton client pattern
- Reset client on credential changes
- Handle authentication errors gracefully
- Log client operations for debugging

## Testing

### Unit Tests
```bash
npm test
```

### Integration Testing
```bash
# Set up test environment
export TIMEZEST_API_TOKEN=test-token

# Run specific test
npm test -- --grep "scheduling"
```

### Docker Testing
```bash
docker build -t timezest-mcp-test .
docker run -it --rm \
  -e TIMEZEST_API_TOKEN=test-token \
  -e LOG_LEVEL=debug \
  timezest-mcp-test
```

## Release Process

Releases are automated using semantic-release:

1. **Commit with conventional format**:
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `refactor:` - Code refactoring
   - `test:` - Testing changes

2. **Push to main branch** - triggers automatic release

3. **GitHub Actions will**:
   - Run tests
   - Build Docker image
   - Create GitHub release
   - Update changelog

## SDK Dependency

### Development
Use local file dependency for development:
```json
"@wyre-technology/node-timezest": "file:../node-timezest"
```

### Production
Swap to published package before release:
```json
"@wyre-technology/node-timezest": "^1.0.0"
```

## Docker Guidelines

### Build Requirements
- Multi-stage builds for size optimization
- GitHub Packages authentication in builder stage
- Prune dev dependencies in builder (has auth)
- Non-root user in production stage
- OCI labels for repository linking

### Environment Variables
- `AUTH_MODE=gateway` for WYRE gateway integration
- `MCP_TRANSPORT=http` for HTTP mode
- `NODE_ENV=production` in containers

## Documentation

### Code Comments
- Document complex business logic
- Explain TimeZest-specific patterns
- Include usage examples for tools
- Document elicitation patterns

### README Updates
- Keep tool lists current
- Update examples when adding features
- Document new configuration options
- Include troubleshooting guidance

## Common Issues

### "Body already read" errors
- Always read `response.text()` first in HTTP client
- Never call `response.json()` then `response.text()`

### Gateway mode issues
- Ensure per-request server instances
- Don't use shared state between requests
- Handle credential injection properly

### Tool registration
- Call `server.sendToolListChanged()` after navigation
- Ensure domains are properly registered
- Check tool naming conventions

### Container builds
- Never run `npm install -g npm@latest` in Alpine
- Always prune in builder stage with auth
- Use OCI labels for package permissions

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Architecture questions
- Clarifications on this guide

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) code of conduct.