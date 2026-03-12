# Contributing to CloudShell

Thank you for your interest in contributing to CloudShell! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20+ and npm
- A Cloudflare account (required for sandbox access)
- Git

### Local Development

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/cloudshell.git
   cd cloudshell
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Cloudflare**
   - Log in to your Cloudflare account
   - Set up Cloudflare Access for local development
   - Configure your `wrangler.toml` with your account ID

4. **Run locally**
   ```bash
   npm run dev
   ```

## Running Tests

We use Vitest for unit tests and gateproof for integration/E2E tests.

```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run all tests with gateproof
npm run gateproof
```

## Code Style

We use strict TypeScript and ESLint:

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Check formatting
npm run format:check

# Format code
npm run format
```

### Requirements

- **No `any` types**: Use proper types or `unknown` with type guards
- **Strict TypeScript**: All code must pass `strict: true`
- **Test coverage**: New features should include tests
- **Documentation**: Update README.md for user-facing changes

## Pull Request Process

1. **Branch naming**: Use descriptive branch names
   - `feat/description` for features
   - `fix/description` for bug fixes
   - `docs/description` for documentation
   - `security/description` for security fixes

2. **Commit messages**: Follow conventional commits
   ```
   feat(scope): Add new feature
   fix(scope): Fix bug
   docs(scope): Update documentation
   test(scope): Add tests
   security(scope): Security fix
   ```

3. **Before submitting**:
   - All tests must pass
   - TypeScript must compile without errors
   - ESLint must pass
   - Code must be formatted with Prettier

4. **PR description**: Include
   - What changed and why
   - How to test the changes
   - Any breaking changes

## Security

Please see [SECURITY.md](SECURITY.md) for our security policy and vulnerability reporting process.

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas

Thank you for contributing!
