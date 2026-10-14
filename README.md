# TimeZest MCP Server

[![Docker Image](https://img.shields.io/badge/docker-ghcr.io%2Fwyre--ai%2Ftimezest--mcp-blue)](https://ghcr.io/wyre-ai/timezest-mcp)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

MCP (Model Context Protocol) server for [TimeZest](https://timezest.com) scheduling platform. Enables LLM agents to create and manage technician scheduling requests with PSA integration.

## Features

- 🎯 **Flat tool list** - every tool listed and callable immediately
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

Copy [`.env.example`](.env.example) and set the variables below.

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `TIMEZEST_API_TOKEN` | For stdio and `AUTH_MODE=env` | TimeZest API token. Gateway mode does not read this. |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `MCP_HTTP_PORT` | No | HTTP port. Defaults to `8080`. |
| `MCP_HTTP_HOST` | No | Bind address when `MCP_TRANSPORT=http`. Defaults to `127.0.0.1`. A configured `CONDUIT_S2S_SECRET` honors this value. The container image sets `0.0.0.0`. |
| `AUTH_MODE` | No | `gateway` (Docker image and Compose default) or `env`. Gateway mode requires `X-Timezest-Api-Token` on each `/mcp` request and never falls back to `TIMEZEST_API_TOKEN`. `env` uses that variable only after S2S auth succeeds. |
| `CONDUIT_S2S_SECRET` | Yes for HTTP | Service-to-service secret. Generate one with `openssl rand -hex 32`. The HTTP server logs an error and exits non-zero when this is empty or a known placeholder (`changeme`, `your-s2s-secret`, `secret`, `placeholder`, and similar public examples). Compose will not start without it. Never commit a real value. The value is never logged. |
| `MCP_ALLOW_INSECURE_DEV` | No | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and forces the listener onto `127.0.0.1` even if `MCP_HTTP_HOST` is a wider address. A known placeholder secret is still refused. |
| `LOG_LEVEL` | No | Log level: `debug`, `info` (default), `warn`, `error` |

`/health` stays unauthenticated and does not read credentials. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The header value is:

```text
t=<unix seconds>,v1=<hex hmac-sha256>
```

`v1` is HMAC-SHA256, as lowercase hex, of the exact ASCII string `t=<unix seconds>` (the same prefix that appears in the header), keyed with `CONDUIT_S2S_SECRET`. The timestamp must be within 300 seconds of the server clock. A missing or invalid header returns 401. The secret is never written to logs.

```bash
t=$(date +%s)
sig=$(printf 't=%s' "$t" | openssl dgst -sha256 -hmac "$CONDUIT_S2S_SECRET" -hex | awk '{print $NF}')
# X-Gateway-S2S: t=$t,v1=$sig
```

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Timezest-Api-Token`. That header is the only credential source for the request. A missing header returns 401 and the server does not fall back to `TIMEZEST_API_TOKEN`.

## Tools

Every tool below is listed and callable immediately — there is no domain to
enter first. The groupings are documentation only.

> **Upgrading from 2.x?** `timezest_navigate` and `timezest_back` are gone.
> Nothing replaces them: call the domain tools directly, because they are all
> listed up front now. A client that used to call
> `timezest_navigate({domain: "agents"})` and then `timezest_agents_list`
> should just call `timezest_agents_list` — likewise
> `timezest_scheduling_list` and the rest. `timezest_status` still works and
> now reports the available tools instead of a menu to enter.

### Status
- `timezest_status` - Show connection status and the available tools

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

### Check What's Available

```
User: "What can TimeZest do?"
Tools: timezest_status
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

The image sets `AUTH_MODE=gateway` and `MCP_HTTP_HOST=0.0.0.0`. Stdio (the image default until `MCP_TRANSPORT=http`) still reads `TIMEZEST_API_TOKEN` and does not use `CONDUIT_S2S_SECRET`.

```bash
# Build image
docker build -t timezest-mcp --build-arg NODE_AUTH_TOKEN=$GITHUB_TOKEN .

# Stdio
docker run -it --rm \
  -e TIMEZEST_API_TOKEN=your-token \
  -e LOG_LEVEL=debug \
  timezest-mcp
```

HTTP gateway mode publishes the port on loopback and passes the S2S secret. The TimeZest token arrives on each request as `X-Timezest-Api-Token`; it is not read from the environment. Generate the secret with `openssl rand -hex 32` — example placeholders such as `changeme` or `your-s2s-secret` are rejected.

```bash
export CONDUIT_S2S_SECRET="$(openssl rand -hex 32)"
docker run --rm \
  -e MCP_TRANSPORT=http \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -p 127.0.0.1:8080:8080 \
  timezest-mcp
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset. The gateway service sets `AUTH_MODE=gateway` and does not inject `TIMEZEST_API_TOKEN` or `env_file`:

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `TIMEZEST_API_TOKEN`:

```bash
docker run --rm \
  -e MCP_TRANSPORT=http \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -e AUTH_MODE=env \
  -e TIMEZEST_API_TOKEN=your-token \
  -p 127.0.0.1:8080:8080 \
  timezest-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` only and logs a warning. A non-loopback `MCP_HTTP_HOST` is overridden:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm run dev
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
- `X-Gateway-S2S` signing on every `/mcp` request (see [HTTP authentication](#http-authentication))
- `X-Timezest-Api-Token` credential injection in gateway mode, with no fallback to `TIMEZEST_API_TOKEN`
- Structured error responses
- Flat tool list (no navigation state to enter)

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