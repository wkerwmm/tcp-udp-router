# Contributing Guide

Thank you for your interest in contributing to the TCP/UDP Router! This guide will help you get started.

## 📋 Table of Contents

- [Code of Conduct](./code-of-conduct.md) - Community guidelines
- [Development Setup](./development.md) - Local development environment
- [Pull Request Guide](./pull-requests.md) - How to submit PRs
- [Documentation Guidelines](./documentation.md) - Writing documentation
- [Testing Guide](./testing.md) - Testing standards
- [Release Process](./release.md) - Release procedures

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher (or **yarn** 1.22+)
- **Git** 2.30+
- **TypeScript** knowledge
- **Docker** (optional, for testing)

### Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/your-username/tcp-udp-router.git
cd tcp-udp-router

# Add the upstream remote
git remote add upstream https://github.com/your-org/tcp-udp-router.git
```

### Install Dependencies

```bash
# Install dependencies
npm install

# Install development dependencies
npm install --include=dev

# Build the project
npm run build
```

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 🏗️ Development Setup

### Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Configure development environment
cat > .env << EOF
NODE_ENV=development
TCP_PORT=4000
UDP_PORT=5000
METRICS_PORT=3001
HTTP_HEALTH_PORT=8080
LOG_LEVEL=debug
METRICS_ENABLED=true
ENABLE_HTTP_HEALTH=true
PLUGIN_AUTO_RELOAD=true
EOF
```

### IDE Configuration

**VS Code Settings** (`.vscode/settings.json`):
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.suggest.autoImports": true,
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.git": true
  }
}
```

**VS Code Extensions** (`.vscode/extensions.json`):
```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-json",
    "bradlc.vscode-tailwindcss"
  ]
}
```

### Development Scripts

```bash
# Development mode with hot reload
npm run dev

# Build the project
npm run build

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Type checking
npm run type-check

# Run all checks
npm run check:all
```

## 📝 Coding Standards

### TypeScript Guidelines

```typescript
// Use strict TypeScript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}

// Prefer interfaces over types for object shapes
interface RouterConfig {
  port: number;
  host: string;
  maxConnections: number;
}

// Use enums for constants
enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

// Use readonly for immutable properties
interface Plugin {
  readonly name: string;
  readonly version: string;
}

// Use proper error handling
class RouterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'RouterError';
  }
}
```

### Code Style

```typescript
// Use meaningful variable names
const maxConnections = 1000; // Good
const mc = 1000; // Bad

// Use descriptive function names
function validateConnection(socket: Socket): boolean { // Good
function vc(s: Socket): boolean { // Bad

// Use async/await instead of callbacks
async function processData(data: Buffer): Promise<Buffer> {
  try {
    const result = await transformData(data);
    return result;
  } catch (error) {
    throw new RouterError('Failed to process data', 'PROCESS_ERROR');
  }
}

// Use proper JSDoc comments
/**
 * Processes incoming TCP data through the router pipeline
 * @param data - The raw data buffer
 * @param socket - The client socket
 * @returns Processed data buffer
 * @throws {RouterError} When processing fails
 */
function processTCPData(data: Buffer, socket: Socket): Buffer {
  // Implementation
}
```

### File Organization

```
src/
├── index.ts                 # Main entry point
├── types/                   # Type definitions
│   ├── index.ts
│   ├── router.ts
│   └── plugin.ts
├── core/                    # Core functionality
│   ├── router.ts
│   ├── tcp-server.ts
│   └── udp-server.ts
├── plugins/                 # Plugin system
│   ├── manager.ts
│   ├── loader.ts
│   └── types.ts
├── middleware/              # Middleware system
│   ├── manager.ts
│   ├── types.ts
│   └── builtin/
├── monitoring/              # Monitoring and metrics
│   ├── metrics.ts
│   ├── health.ts
│   └── logging.ts
├── utils/                   # Utility functions
│   ├── validation.ts
│   ├── crypto.ts
│   └── network.ts
└── config/                  # Configuration
    ├── loader.ts
    ├── validator.ts
    └── defaults.ts
```

## 🧪 Testing Standards

### Unit Testing

```typescript
// tests/unit/router.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TCPRouter } from '../../src/core/router';

describe('TCPRouter', () => {
  let router: TCPRouter;

  beforeEach(() => {
    router = new TCPRouter({
      port: 0, // Use random port for testing
      host: '127.0.0.1'
    });
  });

  afterEach(async () => {
    await router.stop();
  });

  describe('start()', () => {
    it('should start the server successfully', async () => {
      await expect(router.start()).resolves.not.toThrow();
      expect(router.isRunning()).toBe(true);
    });

    it('should throw error if already running', async () => {
      await router.start();
      await expect(router.start()).rejects.toThrow('Server already running');
    });
  });

  describe('stop()', () => {
    it('should stop the server successfully', async () => {
      await router.start();
      await expect(router.stop()).resolves.not.toThrow();
      expect(router.isRunning()).toBe(false);
    });
  });
});
```

### Integration Testing

```typescript
// tests/integration/plugin-integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TCPRouter } from '../../src/core/router';
import { EchoPlugin } from '../../src/plugins/echo-plugin';

describe('Plugin Integration', () => {
  let router: TCPRouter;

  beforeAll(async () => {
    router = new TCPRouter({
      port: 0,
      plugins: [EchoPlugin]
    });
    await router.start();
  });

  afterAll(async () => {
    await router.stop();
  });

  it('should process data through plugins', (done) => {
    const net = require('net');
    const client = new net.Socket();
    
    client.connect(router.port, '127.0.0.1', () => {
      client.write('Hello, World!');
    });
    
    client.on('data', (data: Buffer) => {
      expect(data.toString()).toBe('Hello, World!');
      client.destroy();
      done();
    });
  });
});
```

### Performance Testing

```typescript
// tests/performance/load-test.test.ts
import { describe, it, expect } from '@jest/globals';
import { TCPRouter } from '../../src/core/router';

describe('Load Testing', () => {
  it('should handle 1000 concurrent connections', async () => {
    const router = new TCPRouter({ port: 0 });
    await router.start();

    const connections = [];
    const connectionCount = 1000;

    // Create connections
    for (let i = 0; i < connectionCount; i++) {
      const net = require('net');
      const client = new net.Socket();
      
      await new Promise((resolve) => {
        client.connect(router.port, '127.0.0.1', resolve);
      });
      
      connections.push(client);
    }

    // Verify all connections are established
    expect(connections.length).toBe(connectionCount);

    // Clean up
    connections.forEach(client => client.destroy());
    await router.stop();
  }, 30000); // 30 second timeout
});
```

## 🔄 Contribution Workflow

### 1. Create a Feature Branch

```bash
# Update your fork
git fetch upstream
git checkout main
git merge upstream/main

# Create a feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/your-bug-description
```

### 2. Make Your Changes

```bash
# Make your changes
# Follow the coding standards above

# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "feat: add rate limiting plugin

- Add RateLimitPlugin class
- Implement sliding window algorithm
- Add configuration options
- Include comprehensive tests

Closes #123"
```

### 3. Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
git commit -m "feat(plugins): add authentication plugin"
git commit -m "fix(router): handle connection timeouts properly"
git commit -m "docs(api): update plugin development guide"
git commit -m "test(integration): add load testing scenarios"
```

### 4. Push and Create Pull Request

```bash
# Push your branch
git push origin feature/your-feature-name

# Create pull request on GitHub
# Use the PR template and fill in all sections
```

### 5. Pull Request Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Performance tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows the style guidelines
- [ ] Self-review completed
- [ ] Code is commented, particularly in hard-to-understand areas
- [ ] Corresponding changes to documentation made
- [ ] No new warnings generated
- [ ] Tests added that prove fix is effective or feature works

## Related Issues
Closes #123
```

## 📚 Documentation Standards

### Code Documentation

```typescript
/**
 * TCP/UDP Router for handling network traffic with plugin support
 * 
 * @example
 * ```typescript
 * const router = new TCPRouter({
 *   port: 4000,
 *   plugins: ['logger', 'metrics']
 * });
 * await router.start();
 * ```
 * 
 * @since 1.0.0
 */
export class TCPRouter {
  /**
   * Creates a new TCP router instance
   * 
   * @param config - Router configuration
   * @throws {ValidationError} When configuration is invalid
   */
  constructor(config: RouterConfig) {
    // Implementation
  }

  /**
   * Starts the router and begins accepting connections
   * 
   * @returns Promise that resolves when the server is ready
   * @throws {RouterError} When the server fails to start
   * 
   * @example
   * ```typescript
   * await router.start();
   * console.log('Router started on port', router.port);
   * ```
   */
  async start(): Promise<void> {
    // Implementation
  }
}
```

### API Documentation

```markdown
# TCPRouter Class

Handles TCP connections with plugin support and middleware pipeline.

## Constructor

### `new TCPRouter(config: RouterConfig)`

Creates a new TCP router instance.

**Parameters:**
- `config` (RouterConfig): Router configuration object

**Throws:**
- `ValidationError`: When configuration is invalid

**Example:**
```typescript
const router = new TCPRouter({
  port: 4000,
  host: '0.0.0.0',
  maxConnections: 1000
});
```

## Methods

### `start(): Promise<void>`

Starts the router and begins accepting connections.

**Returns:** Promise that resolves when the server is ready

**Throws:**
- `RouterError`: When the server fails to start

**Example:**
```typescript
await router.start();
console.log('Router started');
```
```

## 🚀 Release Process

### Version Management

```bash
# Check current version
npm version

# Bump version (patch, minor, major)
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.1 -> 1.1.0
npm version major  # 1.1.0 -> 2.0.0

# Create release branch
git checkout -b release/v1.1.0
```

### Release Checklist

- [ ] All tests pass
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated
- [ ] Version is bumped
- [ ] Release notes are prepared
- [ ] Docker image is built and tested
- [ ] npm package is published
- [ ] GitHub release is created

### Automated Release

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
      
      - name: Publish to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      
      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          body: |
            ## What's Changed
            
            See [CHANGELOG.md](CHANGELOG.md) for details.
          draft: false
          prerelease: false
```

## 🤝 Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read our [Code of Conduct](./code-of-conduct.md).

### Communication

- **Issues**: Use GitHub issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for questions and general discussion
- **Security**: Report security issues privately to security@your-org.com

### Recognition

Contributors will be recognized in:
- [CONTRIBUTORS.md](../CONTRIBUTORS.md)
- GitHub repository contributors
- Release notes
- Documentation

## 📚 Additional Resources

- **[Code of Conduct](./code-of-conduct.md)** - Community guidelines
- **[Development Setup](./development.md)** - Detailed setup instructions
- **[Pull Request Guide](./pull-requests.md)** - PR submission process
- **[Documentation Guidelines](./documentation.md)** - Writing documentation
- **[Testing Guide](./testing.md)** - Testing standards
- **[Release Process](./release.md)** - Release procedures

---

<div align="center">

**Ready to contribute?** [Start with an Issue](https://github.com/your-org/tcp-udp-router/issues) • [Join Discussions](https://github.com/your-org/tcp-udp-router/discussions)

</div>