# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-13

### Added

- **JWT Authentication** - Multi-user auth with 24h token expiry
- **Multi-User Container Isolation** - Each user gets isolated container instance
- **Persistent Volumes** - Files in `/home/user` survive container sleep
- **Pre-installed Dev Tools** - git, node, npm, python3, vim, nano, htop, tree, jq, tmux
- **Port Forwarding API** - Expose services running in container via unique URLs
- **tmux Session Persistence** - Terminal state survives disconnects
- **GitHub Actions CI/CD** - Automated testing and deployment
- **Comprehensive Documentation** - Full API reference and usage examples

### Security

- JWT-based authentication replacing Basic Auth
- Password hashing with SHA-256
- Path sanitization to prevent directory traversal
- CSP headers and security middleware

### Technical

- Built on Cloudflare Workers + Containers
- WebSocket terminal with PTY support
- Hono.js web framework
- TypeScript with strict mode
- Vitest for testing

[Unreleased]: https://github.com/acoyfellow/cloudshell/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/acoyfellow/cloudshell/releases/tag/v1.0.0
