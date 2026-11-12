## [Unreleased]

### Security

- Patched vulnerable npm dependencies reported by the Trivy image scan (including `proxy-addr`, `hono`, `qs`, `body-parser`, `ip-address`, `@modelcontextprotocol/sdk`).
- Container image: removed the unused npm CLI from the runtime stage and upgraded Alpine packages (zlib).

## [1.2.5](https://github.com/wyre-technology/timezest-mcp/compare/v1.2.4...v1.2.5) (2026-07-21)


### Bug Fixes

* **http:** wire per-request gateway credentials via AsyncLocalStorage ([341fcf4](https://github.com/wyre-technology/timezest-mcp/commit/341fcf4721fcb0708f2d936f5fe6d0bebe2a5474)), closes [wyre-technology/conduit#1071](https://github.com/wyre-technology/conduit/issues/1071) [#1072](https://github.com/wyre-technology/timezest-mcp/issues/1072)

## [1.2.4](https://github.com/wyre-technology/timezest-mcp/compare/v1.2.3...v1.2.4) (2026-07-21)


### Bug Fixes

* **http:** preserve baseUrl path prefix when building request URLs ([#42](https://github.com/wyre-technology/timezest-mcp/issues/42)) ([2714250](https://github.com/wyre-technology/timezest-mcp/commit/2714250e52ecedb1d145c7550a0f9c898fb41a8a))

## [1.2.3](https://github.com/wyre-technology/timezest-mcp/compare/v1.2.2...v1.2.3) (2026-07-21)


### Bug Fixes

* **deps:** re-pin typescript to ^6.0.3 (regressed again, root cause corrected) ([#41](https://github.com/wyre-technology/timezest-mcp/issues/41)) ([51f3f54](https://github.com/wyre-technology/timezest-mcp/commit/51f3f54854c55a2fa24f5ac8fc24e0102a16ab2d)), closes [41/#39](https://github.com/wyre-technology/timezest-mcp/issues/39) [#42](https://github.com/wyre-technology/timezest-mcp/issues/42)

## [1.2.2](https://github.com/wyre-technology/timezest-mcp/compare/v1.2.1...v1.2.2) (2026-07-20)


### Bug Fixes

* **deps:** exclude dev-dependency majors from Dependabot auto-merge ([#39](https://github.com/wyre-technology/timezest-mcp/issues/39)) ([a18e329](https://github.com/wyre-technology/timezest-mcp/commit/a18e32904d83bb19cfc442e69d8eeeb0596c3cbb))

## [1.2.1](https://github.com/wyre-technology/timezest-mcp/compare/v1.2.0...v1.2.1) (2026-07-20)


### Bug Fixes

* **deps:** pin typescript back to ^6.0.3, unblock tsup DTS build ([#38](https://github.com/wyre-technology/timezest-mcp/issues/38)) ([8d3c863](https://github.com/wyre-technology/timezest-mcp/commit/8d3c86318f228b77ff40c4106f7d1e81221658e8)), closes [#35](https://github.com/wyre-technology/timezest-mcp/issues/35) [#37](https://github.com/wyre-technology/timezest-mcp/issues/37) [#35](https://github.com/wyre-technology/timezest-mcp/issues/35) [#35](https://github.com/wyre-technology/timezest-mcp/issues/35) [wyre-technology/blackpoint-mcp#39](https://github.com/wyre-technology/blackpoint-mcp/issues/39)

# [1.2.0](https://github.com/wyre-technology/timezest-mcp/compare/v1.1.2...v1.2.0) (2026-07-17)


### Features

* interactive scheduling-request card via MCP Apps (SEP-1865) ([#36](https://github.com/wyre-technology/timezest-mcp/issues/36)) ([1db9a9a](https://github.com/wyre-technology/timezest-mcp/commit/1db9a9a54712d503268167c329c2c69a094407a8))

## [1.1.2](https://github.com/wyre-technology/timezest-mcp/compare/v1.1.1...v1.1.2) (2026-07-02)


### Bug Fixes

* add /health liveness route (fixes ACA probe 404 crash-loop) ([#30](https://github.com/wyre-technology/timezest-mcp/issues/30)) ([6674500](https://github.com/wyre-technology/timezest-mcp/commit/6674500462d47f5699f23672db08b3b1892f627b))
* vendor node-timezest SDK in-repo to drop private registry dependency ([#31](https://github.com/wyre-technology/timezest-mcp/issues/31)) ([6687593](https://github.com/wyre-technology/timezest-mcp/commit/6687593d011d40d0aa140cb2bb6a2533450cf5ee))

## Unreleased

### Added

- **Interactive scheduling-request card via MCP Apps (SEP-1865).** `timezest_scheduling_get` results now render as an interactive card in MCP Apps hosts (Claude Desktop/web, and other hosts advertising the `io.modelcontextprotocol/ui` extension), instead of a wall of JSON. The card shows the appointment type, status, trigger mode, customer, resolved agent/team, scheduling window, PSA ticket associations, and booking link as human-readable labels. The card is read-only — TimeZest write actions (create/cancel) stay in the conversation. Non-App hosts are unaffected: the tool's JSON payload is unchanged apart from a new `_card` field.
  - The renderable tool advertises the UI via `_meta` (`ui/resourceUri`, plus the nested `ui.resourceUri` form) pointing at a new `ui://timezest/scheduling-request-card.html` resource served as `text/html;profile=mcp-app`. The card HTML is a self-contained vite single-file bundle embedded at build time (`src/generated/scheduling-request-card-html.ts`, committed), so it serves identically from stdio and Node HTTP transports without filesystem access. The server now declares the `resources` capability and answers `resources/list` / `resources/read` (`src/resources.ts`).
  - The card is neutral by default (system fonts, no vendor identity, no external fetches) and brandable via `window.__BRAND__` injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`, `MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`, `MCP_BRAND_TEXT`): at serve time the server replaces the card's BRAND_INJECT marker with an inline, `<`-escaped `window.__BRAND__` script, so self-hosters can theme the card without rebuilding. No brand configured = HTML served unchanged.
  - The card payload builder is best-effort: appointment-type and agent/team lookups fall back to `#id` labels, and any card-building failure leaves the tool result untouched. New contract tests in `src/__tests__/mcp-apps.test.ts` pin the `_meta` advertisement, the `ui://` resource wire shape, the neutral-default/brand-injection behavior, and the card normalization.

### Changed

- Pin `typescript` to `^6.0.3`: the dependabot bump to 7.0.2 crashes tsup's dts build step (tsup's bundled rollup-plugin-dts is built against the TS 6.x compiler API).

- Vendor the `node-timezest` client in-repo (`src/vendor/node-timezest/`) and drop the private GitHub Packages dependency `@wyre-technology/node-timezest`. Cross-repo GitHub Packages access via the release App token was failing with `403 Forbidden`, breaking `npm ci` in CI and blocking every release/deploy. The client source (with zero runtime dependencies) is now bundled at build time, so `npm ci` and the release pipeline no longer require private-registry access. The Dockerfile's GitHub Packages `.npmrc`/`NODE_AUTH_TOKEN` setup is removed as it is no longer needed.

### Fixed

- Add missing `GET /health` liveness route to the HTTP transport. The server previously returned 404 for any request other than `POST /mcp`, so the Azure Container Apps liveness probe (`GET /health`) failed and the platform recycled the container in a crash-loop. The route now returns `200 {"status":"ok"}` before the catch-all 404.

## [1.1.1](https://github.com/wyre-technology/timezest-mcp/compare/v1.1.0...v1.1.1) (2026-05-29)


### Bug Fixes

* **ci:** bump version so registry gate fires and add required OCI label ([#16](https://github.com/wyre-technology/timezest-mcp/issues/16)) ([c352852](https://github.com/wyre-technology/timezest-mcp/commit/c352852894cc3404fc56dbf5f02bee5de1d43fd2))

# [1.1.0](https://github.com/wyre-technology/timezest-mcp/compare/v1.0.0...v1.1.0) (2026-05-29)


### Features

* **ci:** publish to MCP Registry on release ([#15](https://github.com/wyre-technology/timezest-mcp/issues/15)) ([cc569f7](https://github.com/wyre-technology/timezest-mcp/commit/cc569f76c0c3900cbc343d1f21facc4ed4942fbe))

# 1.0.0 (2026-05-22)


### Bug Fixes

* add --passWithNoTests to vitest to allow builds with no test files ([ccbe423](https://github.com/wyre-technology/timezest-mcp/commit/ccbe4236c0a33ec338afe2e79f64af9591f59abc))
* add explicit type annotation to map callback parameter ([385c7a0](https://github.com/wyre-technology/timezest-mcp/commit/385c7a091d885e7e597a8a794cfb27be88d3e909))
* annotate CallToolRequestSchema handler return type as Promise<any> for SDK 1.29.0 compat ([9e08bb4](https://github.com/wyre-technology/timezest-mcp/commit/9e08bb401afa9113dc01b5cebb8fcccb5a299e54))
* remove exactOptionalPropertyTypes for MCP SDK compatibility ([8849a1d](https://github.com/wyre-technology/timezest-mcp/commit/8849a1da25ab4802747ae666d35a2aa3f368cbd2))
* remove explicit undefined for optional sessionIdGenerator property ([f583bbc](https://github.com/wyre-technology/timezest-mcp/commit/f583bbc0c3f4b419aa375a92c28ee8ffdefe7e3e))
* replace local file: dependency with published npm version for CI ([3af3178](https://github.com/wyre-technology/timezest-mcp/commit/3af3178dcb827eb98700dffdbc2450db03e57229))
* use ListToolsRequestSchema and add extra param for TS compatibility ([ff1aa10](https://github.com/wyre-technology/timezest-mcp/commit/ff1aa105c65b85c19fda57f08cd570dc4064505d))


### Features

* add server.json for MCP Registry publication ([#2](https://github.com/wyre-technology/timezest-mcp/issues/2)) ([0c3ac2d](https://github.com/wyre-technology/timezest-mcp/commit/0c3ac2dc674b2ef96c13d1f238926bd5fbfd0107))
* initial TimeZest MCP server ([1d3f7d9](https://github.com/wyre-technology/timezest-mcp/commit/1d3f7d9021e0ed393dd6bc4a971c3aee0e700a29))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial TimeZest MCP server implementation
- Decision-tree navigation for organized tool discovery
- Complete scheduling request lifecycle (create, view, cancel)
- Support for all 5 TimeZest API resource families:
  - Agents (individual technicians)
  - Teams (round-robin scheduling)
  - Appointment Types (service definitions)
  - Resources (mixed agents + teams)
  - Scheduling Requests (core functionality)
- PSA integration support (ConnectWise, Autotask, Halo)
- TQL (TimeZest Query Language) filtering on all list operations
- IANA timezone preservation and explicit handling
- Dual trigger modes (pod = PSA workflow, generate_url = booking link)
- Gateway-ready architecture with per-request server instances
- Elicitation infrastructure for interactive prompts
- HTTP and stdio transport support
- Docker container with multi-stage builds
- Comprehensive error handling and logging
- Structured logging (stderr only, respects MCP protocol)
- GitHub Packages integration for SDK dependency
- Semantic release automation
