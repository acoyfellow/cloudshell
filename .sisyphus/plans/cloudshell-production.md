# CloudShell Production Plan

## TL;DR

> **Mission**: Transform CloudShell from prototype to production-ready, open-source browser terminal using Cloudflare sandbox containers.
>
> **Deliverables**: Deployed Worker, 80% test coverage via gateproof, Fort Knox security, Diátaxis README, full OSS toolkit.
>
> **Key Risks**: Session architecture design blocks 4/5 security fixes; WebSocket middleware needs early validation.
>
> **Estimated Duration**: 2-3 weeks
> **Parallel Waves**: 3 sequential waves with parallel tasks
> **Critical Path**: Foundation → Session Design → Security → Testing → CI/CD → Release

---

## Context

### Project Overview
CloudShell provides persistent, resumable Linux shells in the browser via Cloudflare Workers + sandbox containers. One sandbox per user, tied to Cloudflare Access email. Full PTY, real container, real filesystem.

### Current State (Pre-Work)
- 4 source files in root (index.ts, shell.ts, types.ts, package.json)
- Basic Worker serving HTML terminal UI via xterm.js
- WebSocket endpoint for PTY passthrough
- No tests, no TypeScript config, no linting
- 5 critical security vulnerabilities present
- No CI/CD, no git repository
- tar.gz archive exists (to be deleted)

### Interview Decisions Summary

| Aspect | Decision |
|--------|----------|
| **Testing** | Full suite (Unit + Integration + E2E) with gateproof.dev, 80% coverage, tests alongside implementation |
| **Security** | Fort Knox: All 5 critical fixes (CSWSH, CSP, rate limiting, input validation, session timeouts), Hono native patterns |
| **Code Quality** | Professional grade, minimal refactor (3-4 files max), strict TypeScript, ESLint + Prettier |
| **Local Dev** | Real Cloudflare sandboxes (requires CF account) |
| **Deployment** | Production only, auto-deploy on merge to main |
| **README** | Hybrid Diátaxis (traditional sections labeled by quadrant) |
| **OSS Files** | Full toolkit: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, GitHub templates |
| **CI/CD** | Strictest gates: type check, lint, unit, integration, e2e, security audit, license check |
| **Gateproof** | Both local (npm run gateproof) and CI integration |

---

## Work Objectives

### Core Objective
Transform CloudShell from a working prototype into a production-ready, open-source project with comprehensive testing, hardened security, and professional documentation.

### Concrete Deliverables
1. **Production Worker**: Deployed to Cloudflare with custom domain
2. **Test Suite**: 80%+ coverage via gateproof.dev (Effect-based gates)
3. **Security Hardening**: All 5 critical vulnerabilities fixed and validated
4. **Clean Codebase**: 3-4 files max, strict TypeScript, no `any`, full linting
5. **OSS Package**: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, GitHub templates
6. **Diátaxis README**: Hybrid structure with clear quadrant labels
7. **CI/CD Pipeline**: Single workflow with strictest gates, auto-deploy on merge

### Definition of Done
- [ ] All CI checks pass (type check, lint, tests 80%+, security audit, license check)
- [ ] Gateproof gates pass for all critical paths
- [ ] Security penetration test validates Fort Knox claims
- [ ] README passes Diátaxis review (all 4 quadrants present and labeled)
- [ ] Production deployment responds to `/health` with `{"status":"ok"}`
- [ ] No `any` types in codebase (`npx tsc --noEmit` passes)
- [ ] All 5 security fixes validated with agent-executable tests
- [ ] OSS files complete and reviewed

### Must Have (Non-Negotiable)
1. 80%+ test coverage validated by gateproof.dev
2. All 5 security fixes: Origin validation, CSP headers, rate limiting, input validation, session timeouts
3. Strict TypeScript (`strict: true`, no `any`)
4. Full ESLint + Prettier toolchain
5. Diátaxis README with all 4 quadrants
6. Full OSS toolkit (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY)
7. CI/CD with strictest gates
8. Production deployment

### Must NOT Have (Guardrails)
- NO staging environment (production only per decision)
- NO `any` types anywhere in codebase
- NO AGENTS.md or AI-specific documentation
- NO separate docs site (README only)
- NO feature expansion beyond terminal + sandbox
- NO multi-user collaboration features
- NO container persistence beyond session lifetime
- NO authentication beyond session tokens
- NO more than 4 files after refactor
- NO external documentation beyond README.md
- NO skipped E2E tests due to complexity

---

## Verification Strategy

### Testing Infrastructure

**Framework**: gateproof.dev (Effect-based E2E testing)
- **Unit Tests**: Vitest for pure functions (sandboxId, validation, utilities)
- **Integration Tests**: gateproof for HTTP routes and WebSocket handshake
- **E2E Tests**: gateproof + Playwright for browser terminal automation

**Gate Pattern**: gateproof uses "observe → act → assert" pattern:
```typescript
const gate = Gate.define({
  observe: createHttpObserveResource({ url: "..." }),
  act: [Act.exec("curl -sf ...")],
  assert: [Assert.httpResponse({ status: 200 }), Assert.noErrors()]
});
```

**Coverage Target**: 80% measured by line coverage with gateproof validation

### QA Policy
Every task MUST include agent-executed QA scenarios:
- **Frontend/UI**: Use Playwright (via gateproof browserAct)
- **CLI/TUI**: Use bash commands via gateproof Act.exec
- **API/Backend**: Use curl via gateproof HTTP assertions
- **Security**: Use specific exploit attempts to verify protection

**Evidence**: Screenshots for UI, terminal output for CLI, response bodies for API → save to `.sisyphus/evidence/`

---

## Execution Strategy

### Wave 1: Foundation (Days 1-3)
Parallel tasks to establish project structure and tooling.

#### Task 1: Project Initialization
**What to do**:
- Delete `cloudshell.tar.gz` archive
- Initialize git repository: `git init`
- Create `.gitignore` (node_modules, .env, dist, coverage, .wrangler)
- Move source files to `src/` directory structure
- Initial commit: `git add . && git commit -m "Initial commit: CloudShell prototype"`

**Must NOT do**:
- Keep tar.gz archive
- Leave files in root (must move to src/)
- Commit without .gitignore

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: `git-master`

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 2, 3, 4)
- **Blocks**: Task 5 (install dependencies), Task 6 (TypeScript config)

**Acceptance Criteria**:
- [ ] `cloudshell.tar.gz` deleted
- [ ] Git repo initialized with `git status` showing clean working tree
- [ ] Source files in `src/` directory (index.ts, shell.ts, types.ts)
- [ ] `.gitignore` present and ignores node_modules, .env, dist

**QA Scenarios**:
```
Scenario: Project structure is correct
  Tool: Bash
  Preconditions: None
  Steps:
    1. ls cloudshell.tar.gz (should fail - file not found)
    2. git status (should show "nothing to commit")
    3. ls src/ (should show index.ts, shell.ts, types.ts)
  Expected Result: Clean git repo with proper structure
  Evidence: .sisyphus/evidence/task-1-structure.txt
```

**Commit**: YES
- Message: `chore(init): Initialize git repo and project structure`
- Files: All files in proper locations

---

#### Task 2: TypeScript Configuration
**What to do**:
- Create `tsconfig.json` with strict mode enabled
- Configure for Cloudflare Workers (ES modules, DOM types)
- Add `include` for src/, `exclude` for node_modules
- Run initial type check to identify all current type errors

**Must NOT do**:
- Use loose TypeScript settings
- Skip strict null checks
- Ignore initial type errors (must fix in Task 5)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 1, 3, 4)
- **Blocked By**: Task 1 (project structure)
- **Blocks**: Task 5 (fix type errors)

**Acceptance Criteria**:
- [ ] `tsconfig.json` created with `strict: true`
- [ ] Includes Workers types (`@cloudflare/workers-types`)
- [ ] Type check command exists: `npm run typecheck`

**QA Scenarios**:
```
Scenario: TypeScript strict mode configured
  Tool: Bash
  Preconditions: Task 1 complete
  Steps:
    1. cat tsconfig.json | grep '"strict": true'
    2. npm run typecheck (identify errors - don't fix yet)
  Expected Result: tsconfig.json exists with strict: true
  Evidence: .sisyphus/evidence/task-2-tsconfig.txt
```

**Commit**: YES (group with Task 3, 4)
- Message: `chore(config): Add TypeScript and tooling configuration`

---

#### Task 3: Linting & Formatting Configuration
**What to do**:
- Install ESLint + Prettier with TypeScript support
- Create `.eslintrc.cjs` with strict rules (no-explicit-any, etc.)
- Create `.prettierrc` with sensible defaults
- Add npm scripts: `lint`, `lint:fix`, `format`, `format:check`

**Must NOT do**:
- Disable ESLint rules to "make it pass"
- Use loose formatting rules
- Skip linting in CI

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 1, 2, 4)
- **Blocked By**: Task 1

**Acceptance Criteria**:
- [ ] ESLint configured with `@typescript-eslint` and `no-explicit-any` rule
- [ ] Prettier configured
- [ ] `npm run lint` and `npm run format` scripts work
- [ ] `.eslintignore` and `.prettierignore` configured

**QA Scenarios**:
```
Scenario: Linting and formatting configured
  Tool: Bash
  Preconditions: Task 1 complete
  Steps:
    1. cat .eslintrc.cjs | grep 'no-explicit-any'
    2. cat .prettierrc | grep 'semi\|singleQuote'
    3. npm run lint (may fail - don't fix yet)
  Expected Result: ESLint and Prettier configs exist
  Evidence: .sisyphus/evidence/task-3-lint.txt
```

**Commit**: YES (group with Task 2, 4)

---

#### Task 4: Package.json Enhancement
**What to do**:
- Update `package.json` with complete OSS metadata
- Add all required scripts (build, dev, deploy, test, lint, typecheck)
- Install dev dependencies: eslint, prettier, typescript, gateproof, @cloudflare/vitest-pool-workers
- Ensure `type: "module"` is set for ES modules

**Must NOT do**:
- Skip adding gateproof dependency
- Omit test scripts
- Use CommonJS (must be ESM)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 1, 2, 3)
- **Blocked By**: Task 1
- **Blocks**: Task 5 (install)

**Acceptance Criteria**:
- [ ] `package.json` has all OSS metadata (homepage, bugs, repository, license, author)
- [ ] All required scripts present
- [ ] gateproof in devDependencies
- [ ] `type: "module"` set

**QA Scenarios**:
```
Scenario: Package.json is production-ready
  Tool: Bash
  Preconditions: Task 1 complete
  Steps:
    1. cat package.json | grep '"license"'
    2. cat package.json | grep '"gateproof"'
    3. cat package.json | grep '"type": "module"'
  Expected Result: Complete metadata and dependencies
  Evidence: .sisyphus/evidence/task-4-package.txt
```

**Commit**: YES (group with Task 2, 3)

---

#### Task 5: Install Dependencies & Fix Initial Errors
**What to do**:
- Run `npm install` to install all dependencies
- Fix all TypeScript errors identified in Task 2
- Fix all linting errors identified in Task 3
- Ensure `npm run typecheck` and `npm run lint` pass

**Must NOT do**:
- Use `any` to silence type errors
- Disable lint rules to "make it pass"
- Skip fixing errors

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (must follow Tasks 1-4)
- **Blocked By**: Tasks 1, 2, 3, 4
- **Blocks**: Task 6 (code refactor)

**Acceptance Criteria**:
- [ ] `npm install` completes without errors
- [ ] `npm run typecheck` passes (exit code 0)
- [ ] `npm run lint` passes (exit code 0)
- [ ] No `any` types added to fix errors

**QA Scenarios**:
```
Scenario: Dependencies installed and checks pass
  Tool: Bash
  Preconditions: Tasks 1-4 complete
  Steps:
    1. ls node_modules/ (directory exists)
    2. npm run typecheck (exit code 0)
    3. npm run lint (exit code 0)
  Expected Result: All checks pass
  Evidence: .sisyphus/evidence/task-5-checks.txt
```

**Commit**: YES
- Message: `chore(deps): Install dependencies and fix initial errors`
- Files: package-lock.json, src/* (fixed errors)

---

### Wave 2: Session Architecture Design (Day 4)
**CRITICAL**: This is the linchpin. 4 of 5 security fixes depend on this design.

#### Task 6: Design Session Management Architecture
**What to do**:
- Design session storage mechanism (Durable Objects? Memory? KV?)
- Define session lifecycle: create → active → idle → timeout → destroy
- Design session ID generation (secure, non-predictable)
- Design session state: email, sandboxId, createdAt, lastActivity, timeout
- Document in code comments or ARCHITECTURE.md section

**Key Questions to Answer**:
- Where is session state stored? (Durable Objects recommended for persistence)
- How long do sessions live? (default: 30 min idle timeout)
- What happens on disconnect? (session stays alive, container warm)
- How are sessions resumed? (session ID in query param, validated)
- Session validation: How to verify session belongs to requesting user?

**Must NOT do**:
- Skip this design and jump to security fixes
- Use client-side storage for session tokens
- Store sensitive data unencrypted

**Recommended Agent Profile**:
- **Category**: `deep`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (blocks security tasks)
- **Blocked By**: Task 5
- **Blocks**: Tasks 7-11 (security fixes)

**Acceptance Criteria**:
- [ ] Session storage mechanism chosen and documented
- [ ] Session lifecycle defined (timestamps, states)
- [ ] Session ID generation strategy documented (secure random)
- [ ] Session state schema defined (interfaces/types)
- [ ] Session validation logic documented

**QA Scenarios**:
```
Scenario: Session architecture is documented
  Tool: Bash
  Preconditions: Task 5 complete
  Steps:
    1. cat src/types.ts (or ARCHITECTURE.md) | grep -i session
    2. Verify session state interface exists
    3. Verify timeout logic is documented
  Expected Result: Clear session architecture documentation
  Evidence: .sisyphus/evidence/task-6-architecture.txt
```

**Commit**: YES
- Message: `docs(architecture): Define session management architecture`
- Files: src/types.ts (updated), possibly ARCHITECTURE.md section

---

### Wave 3: Security Implementation (Days 5-8)
All 5 Fort Knox fixes, now that session architecture is defined.

#### Task 7: CSWSH Protection (Origin Validation)
**What to do**:
- Implement WebSocket origin validation using Hono native patterns
- Validate `Origin` header against allowed origins
- Use Hono `upgradeWebSocket` with validation middleware
- Return 403 for invalid origins

**Implementation Details**:
```typescript
// Use Hono middleware pattern
app.use('/ws/terminal', async (c, next) => {
  const origin = c.req.header('Origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return c.text('Invalid origin', 403);
  }
  await next();
});
```

**Must NOT do**:
- Skip origin validation
- Use `*` as allowed origin
- Log sensitive origin data

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 8, 9, 10, 11 after Task 6)
- **Blocked By**: Task 6 (session design)

**Acceptance Criteria**:
- [ ] Origin validation middleware implemented
- [ ] Returns 403 for invalid origins
- [ ] Test: Valid origin allowed, invalid origin rejected

**QA Scenarios**:
```
Scenario: CSWSH protection works
  Tool: gateproof
  Preconditions: Task 6 complete
  Steps:
    1. Gate: observe WebSocket endpoint
    2. Act: connect with invalid origin (Origin: https://evil.com)
    3. Assert: response status is 403
    4. Act: connect with valid origin
    5. Assert: connection succeeds
  Expected Result: Invalid origins rejected, valid allowed
  Evidence: .sisyphus/evidence/task-7-cswsh.json
```

**Commit**: YES (group with Tasks 8-11)
- Message: `feat(security): Add CSWSH protection with origin validation`

---

#### Task 8: CSP Headers Implementation
**What to do**:
- Implement Content Security Policy headers using Hono native patterns
- Use `hono/secure-headers` middleware or manual headers
- Policy: default-src 'self', script-src 'nonce-{RANDOM}' 'strict-dynamic' CDN, style-src CDN, connect-src wss:
- Generate nonce for inline scripts

**Implementation Details**:
```typescript
import { secureHeaders } from 'hono/secure-headers';

app.use(secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'nonce-{nonce}'", "'strict-dynamic'", "https://cdnjs.cloudflare.com"],
    styleSrc: ["'self'", "https://cdnjs.cloudflare.com"],
    connectSrc: ["'self'", "wss:"],
  }
}));
```

**Must NOT do**:
- Use `unsafe-inline` for scripts
- Omit CSP headers
- Use static nonce (must be per-request random)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Tasks 7, 9, 10, 11)
- **Blocked By**: Task 6

**Acceptance Criteria**:
- [ ] CSP headers present on all HTTP responses
- [ ] Nonce-based script loading for inline scripts
- [ ] Test: Headers present and valid

**QA Scenarios**:
```
Scenario: CSP headers protect against XSS
  Tool: gateproof
  Preconditions: Task 6 complete
  Steps:
    1. Gate: observe HTTP response headers
    2. Act: request main page
    3. Assert: Content-Security-Policy header present
    4. Assert: no 'unsafe-inline' in policy
    5. Assert: nonce present in script-src
  Expected Result: Strict CSP headers on all responses
  Evidence: .sisyphus/evidence/task-8-csp.json
```

**Commit**: YES (group with Tasks 7, 9-11)

---

#### Task 9: Rate Limiting Implementation
**What to do**:
- Implement rate limiting using Hono native patterns or Cloudflare RateLimit API
- Limit: 10 requests per minute per IP for WebSocket upgrades
- Limit: 30 requests per minute per IP for HTTP routes
- Return 429 (Too Many Requests) when limit exceeded

**Implementation Details**:
```typescript
// Option A: Cloudflare RateLimit binding (if available)
// Option B: Simple in-memory rate limiting per IP
const rateLimit = new Map<string, { count: number, resetTime: number }>();

app.use('*', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  // Check and update rate limit
  await next();
});
```

**Must NOT do**:
- Skip rate limiting
- Use client-side rate limiting only
- Log IP addresses without need

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Tasks 7, 8, 10, 11)
- **Blocked By**: Task 6

**Acceptance Criteria**:
- [ ] Rate limiting middleware implemented
- [ ] Returns 429 when limit exceeded
- [ ] Different limits for WebSocket vs HTTP
- [ ] Test: Rapid requests trigger rate limit

**QA Scenarios**:
```
Scenario: Rate limiting prevents abuse
  Tool: gateproof
  Preconditions: Task 6 complete
  Steps:
    1. Gate: observe HTTP responses
    2. Act: send 15 requests in 10 seconds from same IP
    3. Assert: first 10 succeed, 11th+ return 429
    4. Wait 1 minute
    5. Act: send new request
    6. Assert: request succeeds (limit reset)
  Expected Result: Rate limit enforced with proper reset
  Evidence: .sisyphus/evidence/task-9-rate-limit.json
```

**Commit**: YES (group with Tasks 7-8, 10-11)

---

#### Task 10: Input Validation Implementation
**What to do**:
- Validate all user inputs: sandbox ID, email, WebSocket binary data
- Sanitize control characters from terminal input (0x00-0x08, 0x0b, 0x0c, 0x0e-0x1f, 0x7f)
- Validate sandbox ID format: `shell:[a-z0-9-]+`
- Validate email format for CF Access header
- Return 400 for invalid inputs

**Implementation Details**:
```typescript
function validateSandboxId(id: string): boolean {
  return /^shell:[a-z0-9-]+$/.test(id);
}

function sanitizeTerminalInput(data: string): string {
  return data.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}
```

**Must NOT do**:
- Trust user input
- Skip binary data sanitization
- Allow injection attacks

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Tasks 7-9, 11)
- **Blocked By**: Task 6

**Acceptance Criteria**:
- [ ] Input validation functions implemented
- [ ] All query params validated
- [ ] WebSocket data sanitized
- [ ] Tests for injection attempts

**QA Scenarios**:
```
Scenario: Input validation prevents injection
  Tool: gateproof
  Preconditions: Task 6 complete
  Steps:
    1. Gate: observe responses
    2. Act: request with invalid sandbox ID (shell;rm -rf /)
    3. Assert: 400 response
    4. Act: send WebSocket message with control chars
    5. Assert: control chars stripped, terminal still works
  Expected Result: Invalid inputs rejected, valid processed
  Evidence: .sisyphus/evidence/task-10-validation.json
```

**Commit**: YES (group with Tasks 7-9, 11)

---

#### Task 11: Session Timeouts Implementation
**What to do**:
- Implement session idle timeout: 30 minutes default
- Track last activity timestamp in session state
- Check timeout on each WebSocket message and HTTP request
- Gracefully close session with message: "Session timed out due to inactivity"
- Client-side warning at 25 minutes (5 min before timeout)

**Implementation Details**:
```typescript
// In session state
interface SessionState {
  lastActivity: number;
  // ... other fields
}

// Check timeout
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
if (Date.now() - session.lastActivity > IDLE_TIMEOUT) {
  // Close session
}
```

**Must NOT do**:
- Allow infinite sessions
- Skip activity tracking
- Timeout without warning

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Tasks 7-10)
- **Blocked By**: Task 6

**Acceptance Criteria**:
- [ ] Idle timeout implemented (30 min)
- [ ] Activity tracking on every interaction
- [ ] Graceful session closure with message
- [ ] Client-side warning before timeout
- [ ] Test: Timeout after idle period

**QA Scenarios**:
```
Scenario: Session timeout prevents resource exhaustion
  Tool: gateproof + Playwright
  Preconditions: Task 6 complete
  Steps:
    1. Gate: observe WebSocket state
    2. Act: connect and establish session
    3. Wait 30 minutes (simulated or actual)
    4. Act: try to send command
    5. Assert: session closed with timeout message
    6. Assert: reconnection requires re-auth
  Expected Result: Idle sessions terminated after timeout
  Evidence: .sisyphus/evidence/task-11-timeout.json
```

**Commit**: YES (group with Tasks 7-10)
- Message: `feat(security): Add session idle timeout (30min)`

---

### Wave 4: Testing Implementation (Days 9-12)
Now that security is implemented, add comprehensive tests.

#### Task 12: Unit Tests (Vitest)
**What to do**:
- Set up Vitest with `@cloudflare/vitest-pool-workers`
- Write unit tests for pure functions: `sandboxId()`, `validateSandboxId()`, `sanitizeInput()`, `getEmail()`
- Co-locate tests with source files (e.g., `src/utils.ts` + `src/utils.test.ts`)
- Target: 40% of total coverage from unit tests

**Must NOT do**:
- Skip unit tests
- Mock everything (integration tests should use real services)
- Use Jest (must use Vitest for Workers)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (after security tasks)
- **Blocked By**: Tasks 7-11 (security implementations to test)

**Acceptance Criteria**:
- [ ] Vitest configured with Workers pool
- [ ] Unit tests for all pure utility functions
- [ ] Tests co-located with source files
- [ ] `npm run test:unit` passes

**QA Scenarios**:
```
Scenario: Unit tests pass with good coverage
  Tool: Bash
  Preconditions: Tasks 7-11 complete
  Steps:
    1. npm run test:unit
    2. Check coverage report (should show 40%+ from unit tests)
  Expected Result: All unit tests pass
  Evidence: .sisyphus/evidence/task-12-unit.txt
```

**Commit**: YES
- Message: `test(unit): Add unit tests for utility functions`

---

#### Task 13: Integration Tests (gateproof)
**What to do**:
- Set up gateproof for integration testing
- Write gates for HTTP routes: `/health`, `/`, `/ws/terminal`
- Write gates for WebSocket handshake
- Write gates for all 5 security fixes (verify they work)
- Separate test files in `tests/integration/`

**Must NOT do**:
- Skip integration tests
- Use mocks for HTTP/WebSocket (test real services)
- Skip security fix validation

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (after security tasks, with Task 12)
- **Blocked By**: Tasks 7-11

**Acceptance Criteria**:
- [ ] gateproof configured and working
- [ ] Integration gates for all HTTP routes
- [ ] Integration gates for WebSocket
- [ ] Security fix validation gates
- [ ] `npm run test:integration` passes

**QA Scenarios**:
```
Scenario: Integration gates validate all routes
  Tool: gateproof
  Preconditions: Tasks 7-11 complete
  Steps:
    1. npm run test:integration
    2. All gates pass: health, root, websocket, security
  Expected Result: All integration gates pass
  Evidence: .sisyphus/evidence/task-13-integration.json
```

**Commit**: YES
- Message: `test(integration): Add gateproof integration tests`

---

#### Task 14: E2E Tests (gateproof + Playwright)
**What to do**:
- Set up Playwright for browser automation
- Write E2E gates for: user can connect, execute command, disconnect, reconnect
- Write E2E gates for session timeout (may need time manipulation)
- Write E2E gates for all security scenarios from user perspective
- Separate test files in `tests/e2e/`

**Must NOT do**:
- Skip E2E tests (required for 80% coverage target)
- Use headless browser only (test real user flows)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `playwright`

**Parallelization**:
- **Can Run In Parallel**: NO (after integration tests)
- **Blocked By**: Task 13

**Acceptance Criteria**:
- [ ] Playwright configured
- [ ] E2E gates for complete user flows
- [ ] E2E gates for security scenarios
- [ ] Screenshots captured for evidence
- [ ] `npm run test:e2e` passes

**QA Scenarios**:
```
Scenario: E2E gates validate complete user journey
  Tool: gateproof + Playwright
  Preconditions: Task 13 complete
  Steps:
    1. npm run test:e2e
    2. Gates: connect, execute command, output appears
    3. Gates: disconnect, reconnect, session resumes
    4. Screenshots saved to evidence/
  Expected Result: All E2E gates pass with visual evidence
  Evidence: .sisyphus/evidence/task-14-e2e/ (screenshots)
```

**Commit**: YES
- Message: `test(e2e): Add Playwright E2E tests`

---

#### Task 15: Gateproof Local & CI Integration
**What to do**:
- Configure gateproof for local development: `npm run gateproof`
- Add gateproof to CI workflow (after tests pass)
- Configure gateproof to validate 80% coverage target
- Ensure gateproof gates are the final arbiter of "done"

**Must NOT do**:
- Skip gateproof in CI
- Allow merge without gateproof passing

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (after all tests)
- **Blocked By**: Tasks 12-14

**Acceptance Criteria**:
- [ ] `npm run gateproof` script works locally
- [ ] Gateproof runs in CI after tests
- [ ] Coverage target enforced (80%)

**QA Scenarios**:
```
Scenario: Gateproof enforces quality gates
  Tool: Bash
  Preconditions: Tasks 12-14 complete
  Steps:
    1. npm run gateproof
    2. Verify all gates pass
    3. Check coverage meets 80%
  Expected Result: Gateproof passes, coverage >= 80%
  Evidence: .sisyphus/evidence/task-15-gateproof.txt
```

**Commit**: YES
- Message: `chore(gateproof): Configure local and CI gateproof`

---

### Wave 5: CI/CD Pipeline (Days 13-14)

#### Task 16: GitHub Actions CI Workflow
**What to do**:
- Create `.github/workflows/ci.yml` with strictest gates
- Jobs in sequence: lint → typecheck → unit → integration → e2e → security audit → license check
- Use single workflow file (per decision)
- Cache dependencies for speed
- Upload coverage reports as artifacts

**Jobs**:
1. Lint (ESLint)
2. Type check (TypeScript)
3. Unit tests (Vitest)
4. Integration tests (gateproof)
5. E2E tests (gateproof + Playwright)
6. Security audit (npm audit)
7. License check (license-checker)

**Must NOT do**:
- Skip any gate
- Allow failures
- Use placeholder secrets

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (after tests configured)
- **Blocked By**: Tasks 12-15

**Acceptance Criteria**:
- [ ] `.github/workflows/ci.yml` created
- [ ] All 7 jobs defined and required
- [ ] Jobs run in sequence (not parallel - per decision)
- [ ] Workflow triggers on PR and push to main
- [ ] All jobs must pass

**QA Scenarios**:
```
Scenario: CI workflow runs all gates
  Tool: GitHub Actions (dry run or actual)
  Preconditions: Tasks 12-15 complete
  Steps:
    1. Push to feature branch
    2. Create PR
    3. Verify all 7 jobs run and pass
  Expected Result: All CI gates pass
  Evidence: .sisyphus/evidence/task-16-ci.txt
```

**Commit**: YES
- Message: `ci: Add GitHub Actions workflow with strictest gates`

---

#### Task 17: Production Deployment
**What to do**:
- Configure auto-deploy on merge to main (per decision)
- Add Cloudflare API token secret to GitHub
- Create deployment job in CI workflow
- Deploy to production only (no staging)
- Add post-deploy health check

**Secrets Required**:
- `CLOUDFLARE_API_TOKEN` (stored in GitHub Secrets)

**Must NOT do**:
- Deploy without all CI checks passing
- Use staging environment (per decision)
- Skip health check

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (after CI configured)
- **Blocked By**: Task 16

**Acceptance Criteria**:
- [ ] Auto-deploy configured (merge to main triggers deploy)
- [ ] Cloudflare API token in GitHub Secrets
- [ ] Post-deploy health check (`/health` returns 200)
- [ ] Production deployment successful

**QA Scenarios**:
```
Scenario: Deployment works end-to-end
  Tool: GitHub Actions + curl
  Preconditions: Task 16 complete
  Steps:
    1. Merge PR to main
    2. Verify deployment job runs
    3. Verify deploy succeeds
    4. curl https://cloudshell.workers.dev/health
    5. Assert: {"status":"ok"}
  Expected Result: Auto-deploy works, health check passes
  Evidence: .sisyphus/evidence/task-17-deploy.txt
```

**Commit**: YES
- Message: `ci: Add production auto-deploy on merge to main`

---

### Wave 6: OSS Documentation (Days 15-16)
Parallel with Wave 5 (can overlap).

#### Task 18: LICENSE File
**What to do**:
- Create `LICENSE` file with MIT license
- Include copyright year and author name
- Match license declared in package.json

**Must NOT do**:
- Skip LICENSE file
- Use different license than declared

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 19-22)
- **No Blockers**

**Acceptance Criteria**:
- [ ] `LICENSE` file exists at root
- [ ] MIT license text complete
- [ ] Copyright line present

**QA Scenarios**:
```
Scenario: LICENSE file is correct
  Tool: Bash
  Steps:
    1. cat LICENSE | grep "MIT License"
    2. cat LICENSE | grep "Copyright"
  Expected Result: Valid MIT LICENSE file
  Evidence: .sisyphus/evidence/task-18-license.txt
```

**Commit**: YES (group with Tasks 19-22)
- Message: `docs: Add LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY`

---

#### Task 19: CONTRIBUTING.md
**What to do**:
- Create `CONTRIBUTING.md` with:
  - Development setup (git clone, npm install, CF account)
  - How to run tests locally
  - PR process (branch naming, commit conventions)
  - Code style requirements (strict TS, linting)
  - Security reporting guidelines (link to SECURITY.md)

**Must NOT do**:
- Skip contribution guidelines
- Be vague about setup requirements

**Recommended Agent Profile**:
- **Category**: `writing`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 18, 20-22)

**Acceptance Criteria**:
- [ ] `CONTRIBUTING.md` exists
- [ ] Setup instructions clear
- [ ] Test commands documented
- [ ] PR process defined

**QA Scenarios**:
```
Scenario: CONTRIBUTING.md is complete
  Tool: Bash
  Steps:
    1. cat CONTRIBUTING.md | grep -i "development setup"
    2. cat CONTRIBUTING.md | grep -i "npm test"
    3. cat CONTRIBUTING.md | grep -i "pull request"
  Expected Result: All sections present
  Evidence: .sisyphus/evidence/task-19-contributing.txt
```

**Commit**: YES (group with Tasks 18, 20-22)

---

#### Task 20: CODE_OF_CONDUCT.md
**What to do**:
- Create `CODE_OF_CONDUCT.md` using Contributor Covenant v2.1
- Include pledge, standards, enforcement, attribution
- Add contact email for reporting issues

**Must NOT do**:
- Skip code of conduct
- Use outdated version

**Recommended Agent Profile**:
- **Category**: `writing`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 18-19, 21-22)

**Acceptance Criteria**:
- [ ] `CODE_OF_CONDUCT.md` exists
- [ ] Contributor Covenant v2.1
- [ ] Contact email for enforcement

**QA Scenarios**:
```
Scenario: CODE_OF_CONDUCT.md is complete
  Tool: Bash
  Steps:
    1. cat CODE_OF_CONDUCT.md | grep "Contributor Covenant"
    2. cat CODE_OF_CONDUCT.md | grep -i "enforcement"
  Expected Result: Valid CODE_OF_CONDUCT
  Evidence: .sisyphus/evidence/task-20-coc.txt
```

**Commit**: YES (group with Tasks 18-19, 21-22)

---

#### Task 21: SECURITY.md
**What to do**:
- Create `SECURITY.md` with:
  - Supported versions
  - Vulnerability reporting process (email + GitHub Security Advisories)
  - Response timeline (acknowledge within 48h, etc.)
  - Security best practices (link to OWASP, etc.)

**Must NOT do**:
- Skip security policy
- Make reporting process unclear

**Recommended Agent Profile**:
- **Category**: `writing`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 18-20, 22)

**Acceptance Criteria**:
- [ ] `SECURITY.md` exists
- [ ] Reporting process clear
- [ ] Timeline defined

**QA Scenarios**:
```
Scenario: SECURITY.md is complete
  Tool: Bash
  Steps:
    1. cat SECURITY.md | grep -i "vulnerability"
    2. cat SECURITY.md | grep -i "report"
    3. cat SECURITY.md | grep -i "timeline\|48 hours"
  Expected Result: Valid SECURITY.md
  Evidence: .sisyphus/evidence/task-21-security.txt
```

**Commit**: YES (group with Tasks 18-20, 22)

---

#### Task 22: GitHub Templates
**What to do**:
- Create `.github/ISSUE_TEMPLATE/bug_report.md`
- Create `.github/ISSUE_TEMPLATE/feature_request.md`
- Create `.github/PULL_REQUEST_TEMPLATE.md`
- Include sections for description, reproduction steps, expected behavior, etc.

**Must NOT do**:
- Skip templates
- Create overly complex templates

**Recommended Agent Profile**:
- **Category**: `writing`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: YES (with Task 18-21)

**Acceptance Criteria**:
- [ ] Issue templates exist (bug + feature)
- [ ] PR template exists
- [ ] Templates are usable (not too long)

**QA Scenarios**:
```
Scenario: GitHub templates are present
  Tool: Bash
  Steps:
    1. ls .github/ISSUE_TEMPLATE/
    2. ls .github/PULL_REQUEST_TEMPLATE.md
  Expected Result: Templates exist
  Evidence: .sisyphus/evidence/task-22-templates.txt
```

**Commit**: YES (group with Tasks 18-21)

---

### Wave 7: README Restructuring (Days 17-18)

#### Task 23: Diátaxis README Rewrite
**What to do**:
- Restructure README.md following hybrid Diátaxis approach:
  - **Tutorial** (Getting Started): Step-by-step installation and first use
  - **How-To Guides** (Usage): Common tasks (customize container, troubleshoot)
  - **Reference** (API): WebSocket protocol, endpoints, environment variables
  - **Explanation** (Architecture): How it works, security model, session lifecycle
- Label each section with its Diátaxis quadrant
- Keep traditional README flow but with clear labels

**Structure**:
```markdown
# CloudShell

## Quick Start [Tutorial]
...

## Installation [Tutorial]
...

## Common Tasks [How-To Guide]
...

## API Reference [Reference]
...

## WebSocket Protocol [Reference]
...

## Architecture [Explanation]
...

## Security Model [Explanation]
...
```

**Must NOT do**:
- Mix tutorial with reference
- Skip any quadrant
- Create AGENTS.md or external docs

**Recommended Agent Profile**:
- **Category**: `writing`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (after understanding project)
- **Blocked By**: Task 6 (architecture design for Explanation section)

**Acceptance Criteria**:
- [ ] README has all 4 Diátaxis quadrants
- [ ] Each section labeled with quadrant
- [ ] Tutorial is step-by-step and executable
- [ ] Reference is factual and complete
- [ ] No external docs referenced

**QA Scenarios**:
```
Scenario: README follows Diátaxis framework
  Tool: Bash
  Preconditions: Task 6 complete (for Architecture section)
  Steps:
    1. cat README.md | grep -i "\[tutorial\]\|\[how-to\]\|\[reference\]\|\[explanation\]"
    2. Verify all 4 labels present
    3. Check Tutorial section has numbered steps
    4. Check Reference section has API details
  Expected Result: All 4 quadrants present and labeled
  Evidence: .sisyphus/evidence/task-23-readme.txt
```

**Commit**: YES
- Message: `docs: Restructure README following Diátaxis framework`

---

### Wave FINAL: Verification & Release (Day 19-20)

#### Task F1: Security Penetration Test
**What to do**:
- Run security tests attempting to bypass each fix:
  1. CSWSH: Connect from invalid origin
  2. CSP: Try XSS injection
  3. Rate limiting: Flood with requests
  4. Input validation: Try command injection
  5. Session: Try session hijacking, test timeout
- Document all test results
- Verify all 5 fixes hold up

**Must NOT do**:
- Skip penetration testing
- Assume fixes work without testing

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (final verification)
- **Blocked By**: All previous tasks

**Acceptance Criteria**:
- [ ] All 5 security fixes tested with exploit attempts
- [ ] No vulnerabilities found
- [ ] Results documented

**QA Scenarios**:
```
Scenario: Security penetration test validates Fort Knox
  Tool: gateproof + manual curl
  Preconditions: All previous tasks complete
  Steps:
    1. Attempt CSWSH from evil.com origin → Should fail (403)
    2. Attempt XSS with <script> → Should be blocked by CSP
    3. Flood with 100 requests → Should rate limit (429)
    4. Attempt command injection → Should sanitize input
    5. Hijack session token → Should fail validation
  Expected Result: All attacks blocked
  Evidence: .sisyphus/evidence/f1-security-pentest.txt
```

**Commit**: NO (verification task)

---

#### Task F2: Plan Compliance Audit
**What to do**:
- Read plan end-to-end
- Verify each "Must Have" is implemented
- Verify each "Must NOT Have" is absent
- Check evidence files exist
- Verify 80% coverage achieved
- Verify no `any` types

**Must NOT do**:
- Skip audit
- Ignore missing items

**Recommended Agent Profile**:
- **Category**: `oracle`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (final verification)

**Acceptance Criteria**:
- [ ] All 8 "Must Have" items verified
- [ ] All 11 "Must NOT Have" items verified absent
- [ ] 80%+ coverage verified by gateproof
- [ ] No `any` types (TypeScript strict passes)

**QA Scenarios**:
```
Scenario: Plan compliance audit passes
  Tool: Bash + gateproof
  Preconditions: All tasks complete
  Steps:
    1. grep -r "any" src/ (should find 0 in type contexts)
    2. npm run gateproof (should pass)
    3. Verify evidence files exist in .sisyphus/evidence/
  Expected Result: All plan requirements met
  Evidence: .sisyphus/evidence/f2-compliance.txt
```

**Commit**: NO (verification task)

---

#### Task F3: Code Quality Review
**What to do**:
- Run `npm run typecheck` (should pass)
- Run `npm run lint` (should pass)
- Run `npm run format:check` (should pass)
- Review for AI slop patterns (excessive comments, generic names)
- Check file count <= 4 after refactor

**Must NOT do**:
- Ignore lint/type errors
- Accept code quality issues

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: None

**Parallelization**:
- **Can Run In Parallel**: NO (final verification)

**Acceptance Criteria**:
- [ ] Type check passes
- [ ] Lint passes
- [ ] Format check passes
- [ ] File count <= 4
- [ ] No AI slop patterns

**QA Scenarios**:
```
Scenario: Code quality review passes
  Tool: Bash
  Preconditions: All tasks complete
  Steps:
    1. npm run typecheck (exit 0)
    2. npm run lint (exit 0)
    3. npm run format:check (exit 0)
    4. ls src/*.ts | wc -l (should be <= 4)
  Expected Result: All quality checks pass
  Evidence: .sisyphus/evidence/f3-quality.txt
```

**Commit**: NO (verification task)

---

#### Task F4: Production Deployment Verification
**What to do**:
- Verify production deployment is live
- Test `/health` endpoint returns `{"status":"ok"}`
- Test WebSocket connection works
- Test terminal functionality end-to-end
- Verify all security headers present in production

**Must NOT do**:
- Skip production verification
- Assume deployment worked

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: `playwright`

**Parallelization**:
- **Can Run In Parallel**: NO (final verification)

**Acceptance Criteria**:
- [ ] Production URL accessible
- [ ] Health check passes
- [ ] WebSocket works
- [ ] Terminal functional
- [ ] Security headers present

**QA Scenarios**:
```
Scenario: Production deployment is verified
  Tool: curl + Playwright
  Preconditions: Task 17 complete
  Steps:
    1. curl https://cloudshell.workers.dev/health
    2. Assert: {"status":"ok"}
    3. Playwright: open page, connect to terminal
    4. Type 'echo hello', verify output
    5. Check security headers present
  Expected Result: Production fully functional
  Evidence: .sisyphus/evidence/f4-production.png (screenshot)
```

**Commit**: NO (verification task)

---

## Final Verification Wave

### Dependency Matrix Summary

```
Wave 1 (Foundation):
├── Task 1: Project init ─┬→ Task 5
├── Task 2: TypeScript ───┤
├── Task 3: Linting ──────┤
└── Task 4: Package.json ─┘

Wave 2 (Architecture):
└── Task 6: Session design ─→ Wave 3

Wave 3 (Security):
├── Task 7: CSWSH ─┐
├── Task 8: CSP ───┤
├── Task 9: Rate ──┼→ Wave 4
├── Task 10: Input ┤
└── Task 11: Timeout┘

Wave 4 (Testing):
├── Task 12: Unit ─┐
├── Task 13: Int ──┼→ Wave 5
├── Task 14: E2E ──┤
└── Task 15: Gateproof┘

Wave 5 (CI/CD):
├── Task 16: CI workflow ─→ Task 17
└── Task 17: Deploy

Wave 6 (OSS, parallel):
├── Task 18: LICENSE
├── Task 19: CONTRIBUTING
├── Task 20: CODE_OF_CONDUCT
├── Task 21: SECURITY
└── Task 22: Templates

Wave 7 (README):
└── Task 23: Diátaxis README ─→ Wave FINAL

Wave FINAL (Verification, parallel):
├── F1: Security pentest
├── F2: Compliance audit
├── F3: Quality review
└── F4: Production verification
```

### Agent Dispatch Summary

| Wave | Tasks | Categories |
|------|-------|------------|
| 1 | 5 | quick (5) |
| 2 | 1 | deep (1) |
| 3 | 5 | unspecified-high (5) |
| 4 | 4 | quick (1), unspecified-high (3) |
| 5 | 2 | unspecified-high (2) |
| 6 | 5 | quick (1), writing (4) |
| 7 | 1 | writing (1) |
| FINAL | 4 | oracle (1), unspecified-high (3) |

---

## Commit Strategy

### Commit Conventions

Use conventional commits throughout:
- `feat(scope)`: New feature
- `fix(scope)`: Bug fix
- `test(scope)`: Tests
- `docs(scope)`: Documentation
- `chore(scope)`: Maintenance
- `ci(scope)`: CI/CD

**Scopes**: `init`, `config`, `security`, `test`, `docs`, `ci`, `deps`

### Commit Grouping

| Group | Tasks | Message |
|-------|-------|---------|
| 1 | 2,3,4 | `chore(config): Add TypeScript, ESLint, Prettier configuration` |
| 2 | 7-11 | `feat(security): Add Fort Knox security hardening` |
| 3 | 18-22 | `docs: Add LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, templates` |
| Individual | 1,5,6,12-17,23 | Separate commits as listed in tasks |

---

## Success Criteria

### Verification Commands

```bash
# All checks must pass
npm run typecheck        # TypeScript strict mode
npm run lint             # ESLint with strict rules
npm run test:unit        # Unit tests (40%+ coverage)
npm run test:integration # Integration gates
npm run test:e2e         # E2E gates with Playwright
npm run gateproof        # Gateproof validation (80%+ coverage)
npm audit                # Security audit (no high/critical)

# Production health check
curl https://cloudshell.workers.dev/health
# Expected: {"status":"ok"}

# Security headers check
curl -I https://cloudshell.workers.dev/
# Expected: Content-Security-Policy, X-Frame-Options, etc.
```

### Final Checklist

- [ ] All 8 "Must Have" items implemented and verified
- [ ] All 11 "Must NOT Have" items verified absent
- [ ] 80%+ test coverage validated by gateproof
- [ ] 5 security fixes pass penetration testing
- [ ] No `any` types in codebase
- [ ] All CI gates pass (7 jobs)
- [ ] Production deployment successful and healthy
- [ ] README follows Diátaxis framework with all 4 quadrants
- [ ] Full OSS toolkit present (LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, templates)
- [ ] Documentation reviewed and accurate

---

## Appendices

### A. Gateproof Integration Pattern

**Local Development**:
```bash
npm run gateproof
# Runs all gates and validates 80% coverage
```

**CI Integration**:
```yaml
# In .github/workflows/ci.yml
- name: Gateproof
  run: npm run gateproof
```

**Gate Definition Example**:
```typescript
// tests/gates/health.gate.ts
import { Gate, Act, Assert } from 'gateproof';

export const healthGate = Gate.define({
  id: 'health-check',
  observe: { type: 'http', url: 'http://localhost:8787/health' },
  act: [Act.fetch()],
  assert: [
    Assert.status(200),
    Assert.json({ status: 'ok' }),
    Assert.noErrors()
  ]
});
```

### B. Security Configuration

**Critical Settings (Constants)**:
- CSP Policy (defined in code)
- Allowed Origins (defined in code)
- Session timeout: 30 minutes

**Operational Settings (Environment)**:
- Rate limit: 10 req/min (WebSocket), 30 req/min (HTTP)
- Max instances: 5 (in wrangler.jsonc)
- Idle timeout: 30 minutes

### C. Cloudflare Access Setup

Required for production:
1. Go to https://one.dash.cloudflare.com/
2. Create Access Application for worker URL
3. Add policy allowing specific email(s)
4. `Cf-Access-Authenticated-User-Email` header flows automatically

### D. File Structure (Final)

```
cloudshell/
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
├── src/
│   ├── index.ts          # Routes + middleware
│   ├── shell.ts          # HTML/JS terminal UI
│   ├── utils.ts          # Extracted utilities (NEW)
│   └── types.ts          # Type definitions
├── tests/
│   ├── integration/      # gateproof gates
│   └── e2e/             # Playwright tests
├── .eslintrc.cjs
├── .gitignore
├── .prettierrc
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── README.md            # Diátaxis structure
├── SECURITY.md
├── tsconfig.json
└── wrangler.jsonc
```

### E. Risk Mitigation Summary

| Risk | Mitigation |
|------|------------|
| Session design blocks security | Task 6 is explicit, must complete before Wave 3 |
| WebSocket middleware doesn't work | Early validation task (F1 includes this check) |
| Gateproof incompatible | Have Vitest fallback ready, but gateproof is confirmed compatible |
| CF account needed for dev | Documented in CONTRIBUTING, required for all dev |
| 80% coverage hard to reach | Split: 40% unit, 40% integration/e2e |
| Single workflow slow | Accept tradeoff (per decision), optimize with caching |
| More than 4 files needed | Re-evaluate "minimal refactor" vs "professional grade" |

---

## Notes for Executor

1. **Session Architecture is the Linchpin**: Task 6 must be completed with care - 4 of 5 security fixes depend on it.

2. **Gateproof is Primary**: Use gateproof for integration and E2E tests. Vitest only for unit tests.

3. **Security is Non-Negotiable**: All 5 Fort Knox fixes must pass penetration testing (Task F1).

4. **No `any` Types**: Use `unknown` with type guards instead of `any`.

5. **Single Workflow**: Despite slowness, keep CI in one file per user decision.

6. **Evidence Required**: Every task must produce evidence in `.sisyphus/evidence/`.

7. **Final Verification**: All 4 FINAL tasks must pass before project is complete.
