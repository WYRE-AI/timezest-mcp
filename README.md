# TimeZest MCP Server

[![Docker Image](https://img.shields.io/badge/docker-ghcr.io%2Fwyre--ai%2Ftimezest--mcp-blue)](https://ghcr.io/wyre-ai/timezest-mcp)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

MCP (Model Context Protocol) server for [TimeZest](https://timezest.com) scheduling platform. Enables LLM agents to create and manage technician scheduling requests with PSA integration.

## Features

- 🎯 **Decision-tree navigation** - organized tool discovery
- 📅 **Full scheduling lifecycle** - create, view, cancel requests
- 🔗 **PSA integration** - ConnectWise, Autotask, Halo support
- 🌍 **IANA timezone handling** - explicit timezone management
- 🚀 **Dual trigger modes** - PSA workflows or booking URLs
- 🛡️ **Gateway-ready** - stateless per-request design
- 🔍 **TQL filtering** - TimeZest Query Language support
- ✨ **Elicitation support** - interactive user prompts
- 📇 **Interactive scheduling-request card (MCP Apps)** - `timezest_scheduling_get` renders as a card in MCP Apps hosts; neutral by default, brandable via `window.__BRAND__` injection or `MCP_BRAND_*` env vars

## Quick Start

### Docker (Recommended)

```bash
docker run -it --rm \
  -e TIMEZEST_API_TOKEN=your-api-token \
  ghcr.io/wyre-ai/timezest-mcp:latest
```

### npm

```bash
npm install -g @wyre-ai/timezest-mcp
TIMEZEST_API_TOKEN=your-token timezest-mcp
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `TIMEZEST_API_TOKEN` | Yes | TimeZest API token |
| `MCP_TRANSPORT` | No | Transport mode: `stdio` (default) or `http` |
| `MCP_HTTP_PORT` | No | HTTP port (default: 8080) |
| `AUTH_MODE` | No | Set to `gateway` for WYRE gateway integration |
| `LOG_LEVEL` | No | Log level: `debug`, `info` (default), `warn`, `error` |

## Tool Domains

The server uses decision-tree navigation to organize tools by domain:

### Navigation
- `timezest_navigate` - Enter a domain to access its tools
- `timezest_status` - Show available domains and current state

### Agents
- `timezest_agents_list` - List individual technicians
- `timezest_agents_get` - Get agent details

### Teams
- `timezest_teams_list` - List teams (round-robin scheduling)
- `timezest_teams_get` - Get team details

### Appointment Types
- `timezest_appointment_types_list` - List available service types
- `timezest_appointment_types_get` - Get appointment type details

### Resources
- `timezest_resources_list` - List all resources (agents + teams)

### Scheduling (Core Domain)
- `timezest_scheduling_list` - List scheduling requests
- `timezest_scheduling_get` - Get request details
- `timezest_scheduling_create_request` - **Create new request** (key tool)
- `timezest_scheduling_cancel` - Cancel request

## Usage Examples

### Basic Navigation

```
User: "Show me TimeZest domains"
Tools: timezest_status

User: "Go to scheduling"
Tools: timezest_navigate(domain="scheduling")
```

### Create a Scheduling Request

```
User: "Book a technician for server repair at Customer Corp tomorrow"
Tools: timezest_scheduling_create_request({
  "appointmentTypeId": "repair-onsite",
  "triggerMode": "pod",
  "endUser": {
    "name": "John Doe",
    "company": "Customer Corp",
    "email": "john@customer.com"
  },
  "timeRange": {
    "earliestDate": "2024-02-01",
    "earliestTime": "09:00",
    "latestDate": "2024-02-01", 
    "latestTime": "17:00",
    "timezone": "America/New_York"
  },
  "associatedEntities": [
    {"type": "connectwise", "id": "12345", "number": "T20240001"}
  ]
})
```

### PSA Integration

Link scheduling requests to PSA tickets:

```json
{
  "associatedEntities": [
    {"type": "connectwise", "id": "12345", "number": "T20240001"},
    {"type": "autotask", "id": "67890"},
    {"type": "halo", "id": "11111"}
  ]
}
```

### Trigger Modes

- **`pod`**: Fires the configured PSA workflow (creates calendar entries, updates tickets)
- **`generate_url`**: Returns a shareable booking URL for customers

## TQL Filtering

TimeZest Query Language examples:

```
# Active agents in IT department
filter: "active:true AND department:\"IT Support\""

# Recent scheduling requests
filter: "createdAt:>=2024-01-01 AND status:pending"

# Specific customer requests  
filter: "endUser.company:\"Important Customer\""
```

## Timezone Handling

**CRITICAL**: Always specify IANA timezones explicitly. TimeZest interprets scheduling windows in the specified timezone.

```json
{
  "timeRange": {
    "earliestDate": "2024-02-01",
    "earliestTime": "09:00", 
    "timezone": "America/New_York"  // ✅ Required
  }
}
```

## Development

### Local Setup

```bash
# Clone and install
git clone https://github.com/WYRE-AI/timezest-mcp.git
cd timezest-mcp
npm install

# Development with file dependency (replace before publish)
# Edit package.json: "@wyre-technology/node-timezest": "file:../node-timezest"

# Build and test
npm run build
npm test

# Run locally
TIMEZEST_API_TOKEN=your-token npm run dev
```

### Docker Development

```bash
# Build image
docker build -t timezest-mcp --build-arg NODE_AUTH_TOKEN=$GITHUB_TOKEN .

# Run container
docker run -it --rm \
  -e TIMEZEST_API_TOKEN=your-token \
  -e LOG_LEVEL=debug \
  timezest-mcp
```

## MCP Integration

### Claude Desktop

Add to your MCP settings:

```json
{
  "mcpServers": {
    "timezest": {
      "command": "npx",
      "args": ["@wyre-ai/timezest-mcp"],
      "env": {
        "TIMEZEST_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

### WYRE Gateway

The server is designed for the WYRE MCP Gateway with:
- Per-request server instances (stateless)
- Header-based credential injection
- Structured error responses
- Decision-tree tool organization

## API Coverage

| TimeZest API | Coverage | Notes |
|--------------|----------|-------|
| Agents | ✅ List, Get | Individual technicians |
| Teams | ✅ List, Get | Round-robin scheduling |
| Appointment Types | ✅ List, Get | Service type definitions |
| Resources | ✅ List | Unified agents + teams |
| Scheduling Requests | ✅ CRUD | Core scheduling functionality |
| TQL Filtering | ✅ All endpoints | TimeZest Query Language |
| PSA Integration | ✅ All systems | ConnectWise, Autotask, Halo |
| Webhooks | ❌ N/A | TimeZest doesn't provide webhooks |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

Apache 2.0 - see [LICENSE](LICENSE) file for details.

## Links

- [TimeZest API Documentation](https://developer.timezest.com/)
- [TimeZest Help Center](https://help.timezest.com/)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [WYRE Technology](https://wyre.technology/)