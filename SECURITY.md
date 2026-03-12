# Security Policy

## Supported Versions

We currently support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do Not Open a Public Issue

Please do not open a public GitHub issue for security vulnerabilities.

### 2. Report Privately

Email us at **security@cloudshell.dev** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### 3. Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix timeline**: Based on severity
  - Critical: 7 days
  - High: 14 days
  - Medium: 30 days
  - Low: 60 days

### 4. Disclosure

We follow responsible disclosure:
- We'll work with you to understand and fix the issue
- We'll credit you in the security advisory (unless you prefer anonymity)
- We'll publicly disclose after the fix is released

## Security Best Practices

### For Users

1. **Keep your browser updated**: Ensure you're using the latest browser version
2. **Use strong authentication**: Enable MFA on your Cloudflare account
3. **Report suspicious activity**: Contact us if you notice unusual behavior

### For Developers

1. **No `any` types**: All code must use strict TypeScript
2. **Input validation**: All user inputs are validated and sanitized
3. **Security headers**: CSP, HSTS, and other headers are enforced
4. **Rate limiting**: Requests are rate-limited to prevent abuse

## Security Features

CloudShell implements the following security measures:

- **CSWSH Protection**: Origin validation on WebSocket connections
- **CSP Headers**: Strict Content Security Policy with nonces
- **Rate Limiting**: 10 req/min WebSocket, 30 req/min HTTP
- **Input Validation**: All inputs validated and sanitized
- **Session Timeouts**: 30-minute idle timeout
- **No `any` types**: Full TypeScript strict mode

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Cloudflare Security](https://www.cloudflare.com/security/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
