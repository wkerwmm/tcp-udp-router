# Plugin Development Guide

Complete guide to developing plugins for the TCP/UDP Router.

## 📋 Table of Contents

- [Plugin Basics](./basics.md) - Core plugin concepts
- [Plugin API](./api.md) - Complete plugin API reference
- [Plugin Examples](./examples.md) - Example plugins and use cases
- [Plugin Testing](./testing.md) - Testing plugins
- [Plugin Distribution](./distribution.md) - Publishing plugins

## 🚀 Quick Start

### Create Your First Plugin

```typescript
// plugins/echo-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

export class EchoPlugin implements Plugin {
  name = 'echo';
  version = '1.0.0';
  description = 'Echoes back received data';

  onConnect(socket: Socket) {
    console.log(`[${this.name}] New connection from ${socket.remoteAddress}`);
  }

  onData(data: Buffer, socket: Socket): Buffer {
    console.log(`[${this.name}] Echoing: ${data.toString()}`);
    return data; // Echo back the same data
  }

  onDisconnect(socket: Socket) {
    console.log(`[${this.name}] Connection closed from ${socket.remoteAddress}`);
  }
}

export default EchoPlugin;
```

### Register the Plugin

```typescript
// src/index.ts
import { TCPRouter } from 'tcp-udp-router';
import EchoPlugin from './plugins/echo-plugin';

const router = new TCPRouter({
  port: 4000,
  plugins: [EchoPlugin]
});

router.start();
```

## 🏗️ Plugin Architecture

### Plugin Lifecycle

```typescript
interface Plugin {
  // Plugin metadata
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;

  // Lifecycle hooks
  onLoad?(config: PluginConfig): void | Promise<void>;
  onUnload?(): void | Promise<void>;
  
  // Connection events
  onConnect?(socket: Socket): void;
  onDisconnect?(socket: Socket): void;
  
  // Data processing
  onData?(data: Buffer, socket: Socket): Buffer | Promise<Buffer>;
  onError?(error: Error, socket?: Socket): void;
  
  // Plugin-specific methods
  [key: string]: any;
}
```

### Plugin Configuration

```typescript
interface PluginConfig {
  // Plugin-specific configuration
  [key: string]: any;
  
  // Common configuration
  enabled?: boolean;
  priority?: number;
  timeout?: number;
}
```

## 🔌 Plugin Types

### 1. Data Processing Plugins

```typescript
// plugins/transformer-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

export class TransformerPlugin implements Plugin {
  name = 'transformer';
  version = '1.0.0';
  
  private transformFunction: (data: Buffer) => Buffer;

  constructor(transformFunction: (data: Buffer) => Buffer) {
    this.transformFunction = transformFunction;
  }

  onData(data: Buffer, socket: Socket): Buffer {
    return this.transformFunction(data);
  }
}

// Usage
const upperCasePlugin = new TransformerPlugin((data) => 
  Buffer.from(data.toString().toUpperCase())
);
```

### 2. Logging Plugins

```typescript
// plugins/logger-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

export class LoggerPlugin implements Plugin {
  name = 'logger';
  version = '1.0.0';
  
  private logLevel: 'debug' | 'info' | 'warn' | 'error';
  private logFile?: string;

  constructor(options: { level?: string; file?: string } = {}) {
    this.logLevel = (options.level as any) || 'info';
    this.logFile = options.file;
  }

  onConnect(socket: Socket) {
    this.log('info', `Connection from ${socket.remoteAddress}:${socket.remotePort}`);
  }

  onData(data: Buffer, socket: Socket): Buffer {
    this.log('debug', `Data from ${socket.remoteAddress}: ${data.toString()}`);
    return data;
  }

  onDisconnect(socket: Socket) {
    this.log('info', `Disconnection from ${socket.remoteAddress}:${socket.remotePort}`);
  }

  private log(level: string, message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (this.logFile) {
      // Write to file
      require('fs').appendFileSync(this.logFile, logMessage + '\n');
    } else {
      console.log(logMessage);
    }
  }
}
```

### 3. Authentication Plugins

```typescript
// plugins/auth-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

export class AuthPlugin implements Plugin {
  name = 'auth';
  version = '1.0.0';
  
  private validTokens: Set<string>;

  constructor(tokens: string[]) {
    this.validTokens = new Set(tokens);
  }

  onConnect(socket: Socket) {
    // Store authentication state
    (socket as any).authenticated = false;
  }

  onData(data: Buffer, socket: Socket): Buffer | null {
    const message = data.toString();
    
    if (!(socket as any).authenticated) {
      // Check for authentication token
      if (message.startsWith('AUTH:')) {
        const token = message.substring(5);
        if (this.validTokens.has(token)) {
          (socket as any).authenticated = true;
          socket.write(Buffer.from('AUTH_OK\n'));
          return null; // Don't pass this message to other plugins
        } else {
          socket.write(Buffer.from('AUTH_FAILED\n'));
          socket.destroy();
          return null;
        }
      } else {
        socket.write(Buffer.from('AUTH_REQUIRED\n'));
        socket.destroy();
        return null;
      }
    }
    
    return data; // Pass through authenticated data
  }
}
```

### 4. Rate Limiting Plugins

```typescript
// plugins/rate-limit-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export class RateLimitPlugin implements Plugin {
  name = 'rate-limit';
  version = '1.0.0';
  
  private config: RateLimitConfig;
  private requestCounts: Map<string, { count: number; resetTime: number }>;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.requestCounts = new Map();
  }

  onData(data: Buffer, socket: Socket): Buffer | null {
    const clientId = socket.remoteAddress;
    const now = Date.now();
    
    // Get or create client record
    let clientRecord = this.requestCounts.get(clientId);
    if (!clientRecord || now > clientRecord.resetTime) {
      clientRecord = { count: 0, resetTime: now + this.config.windowMs };
      this.requestCounts.set(clientId, clientRecord);
    }
    
    // Check rate limit
    if (clientRecord.count >= this.config.maxRequests) {
      socket.write(Buffer.from('RATE_LIMIT_EXCEEDED\n'));
      return null; // Block the request
    }
    
    // Increment counter
    clientRecord.count++;
    
    return data; // Allow the request
  }

  onDisconnect(socket: Socket) {
    // Clean up client record
    this.requestCounts.delete(socket.remoteAddress);
  }
}
```

## 🔧 Advanced Plugin Features

### Plugin Dependencies

```typescript
// plugins/encryption-plugin.ts
import { Plugin, Socket, PluginManager } from 'tcp-udp-router';

export class EncryptionPlugin implements Plugin {
  name = 'encryption';
  version = '1.0.0';
  dependencies = ['auth']; // Requires auth plugin
  
  private crypto = require('crypto');
  private algorithm = 'aes-256-cbc';

  onLoad(config: PluginConfig) {
    // Check if auth plugin is loaded
    const authPlugin = PluginManager.getPlugin('auth');
    if (!authPlugin) {
      throw new Error('Encryption plugin requires auth plugin');
    }
  }

  onData(data: Buffer, socket: Socket): Buffer {
    // Only encrypt if authenticated
    if ((socket as any).authenticated) {
      return this.encrypt(data);
    }
    return data;
  }

  private encrypt(data: Buffer): Buffer {
    const key = this.crypto.scryptSync('password', 'salt', 32);
    const iv = this.crypto.randomBytes(16);
    const cipher = this.crypto.createCipher(this.algorithm, key);
    
    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return Buffer.concat([iv, encrypted]);
  }
}
```

### Plugin Configuration

```typescript
// plugins/configurable-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

interface ConfigurablePluginConfig {
  prefix: string;
  suffix: string;
  enabled: boolean;
}

export class ConfigurablePlugin implements Plugin {
  name = 'configurable';
  version = '1.0.0';
  
  private config: ConfigurablePluginConfig;

  constructor(config: Partial<ConfigurablePluginConfig> = {}) {
    this.config = {
      prefix: config.prefix || '[PLUGIN]',
      suffix: config.suffix || '',
      enabled: config.enabled !== false
    };
  }

  onData(data: Buffer, socket: Socket): Buffer {
    if (!this.config.enabled) {
      return data;
    }
    
    const message = data.toString();
    const modifiedMessage = `${this.config.prefix} ${message} ${this.config.suffix}`;
    
    return Buffer.from(modifiedMessage);
  }
}

// Usage with configuration
const plugin = new ConfigurablePlugin({
  prefix: '[CUSTOM]',
  suffix: '[END]',
  enabled: true
});
```

### Plugin State Management

```typescript
// plugins/stateful-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

interface ClientState {
  connectionTime: number;
  dataReceived: number;
  lastActivity: number;
}

export class StatefulPlugin implements Plugin {
  name = 'stateful';
  version = '1.0.0';
  
  private clientStates: Map<string, ClientState> = new Map();

  onConnect(socket: Socket) {
    const clientId = socket.remoteAddress;
    this.clientStates.set(clientId, {
      connectionTime: Date.now(),
      dataReceived: 0,
      lastActivity: Date.now()
    });
  }

  onData(data: Buffer, socket: Socket): Buffer {
    const clientId = socket.remoteAddress;
    const state = this.clientStates.get(clientId);
    
    if (state) {
      state.dataReceived += data.length;
      state.lastActivity = Date.now();
      
      // Add state information to data
      const stateInfo = `[STATE:${state.dataReceived}bytes] `;
      return Buffer.concat([Buffer.from(stateInfo), data]);
    }
    
    return data;
  }

  onDisconnect(socket: Socket) {
    const clientId = socket.remoteAddress;
    const state = this.clientStates.get(clientId);
    
    if (state) {
      const duration = Date.now() - state.connectionTime;
      console.log(`Client ${clientId} disconnected after ${duration}ms, received ${state.dataReceived} bytes`);
      this.clientStates.delete(clientId);
    }
  }

  // Plugin-specific method to get statistics
  getStatistics() {
    return {
      activeConnections: this.clientStates.size,
      totalDataReceived: Array.from(this.clientStates.values())
        .reduce((sum, state) => sum + state.dataReceived, 0)
    };
  }
}
```

## 🧪 Testing Plugins

### Unit Testing

```typescript
// plugins/__tests__/echo-plugin.test.ts
import { EchoPlugin } from '../echo-plugin';
import { Socket } from 'tcp-udp-router';

describe('EchoPlugin', () => {
  let plugin: EchoPlugin;
  let mockSocket: Partial<Socket>;

  beforeEach(() => {
    plugin = new EchoPlugin();
    mockSocket = {
      remoteAddress: '127.0.0.1',
      write: jest.fn(),
      destroy: jest.fn()
    };
  });

  test('should echo back received data', () => {
    const inputData = Buffer.from('Hello, World!');
    const result = plugin.onData(inputData, mockSocket as Socket);
    
    expect(result).toEqual(inputData);
  });

  test('should log connection events', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    plugin.onConnect(mockSocket as Socket);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      '[echo] New connection from 127.0.0.1'
    );
    
    consoleSpy.mockRestore();
  });
});
```

### Integration Testing

```typescript
// plugins/__tests__/plugin-integration.test.ts
import { TCPRouter } from 'tcp-udp-router';
import { EchoPlugin } from '../echo-plugin';
import { LoggerPlugin } from '../logger-plugin';

describe('Plugin Integration', () => {
  let router: TCPRouter;

  beforeEach(async () => {
    router = new TCPRouter({
      port: 0, // Use random port
      plugins: [EchoPlugin, LoggerPlugin]
    });
    await router.start();
  });

  afterEach(async () => {
    await router.stop();
  });

  test('should process data through multiple plugins', (done) => {
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

## 📦 Plugin Distribution

### Plugin Package Structure

```
my-tcp-udp-plugin/
├── package.json
├── README.md
├── src/
│   ├── index.ts
│   └── plugin.ts
├── dist/
│   └── index.js
├── tests/
│   └── plugin.test.ts
└── examples/
    └── usage.ts
```

### Package.json

```json
{
  "name": "tcp-udp-router-echo-plugin",
  "version": "1.0.0",
  "description": "Echo plugin for TCP/UDP Router",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["tcp-udp-router", "plugin", "echo"],
  "author": "Your Name",
  "license": "MIT",
  "peerDependencies": {
    "tcp-udp-router": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  },
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "prepublishOnly": "npm run build"
  }
}
```

### Publishing to npm

```bash
# Build the plugin
npm run build

# Test the plugin
npm test

# Publish to npm
npm publish
```

## 🔍 Plugin Debugging

### Debug Mode

```typescript
// plugins/debug-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

export class DebugPlugin implements Plugin {
  name = 'debug';
  version = '1.0.0';
  
  private debug: boolean;

  constructor(debug: boolean = false) {
    this.debug = debug;
  }

  onData(data: Buffer, socket: Socket): Buffer {
    if (this.debug) {
      console.log(`[DEBUG] Processing ${data.length} bytes from ${socket.remoteAddress}`);
      console.log(`[DEBUG] Data: ${data.toString('hex')}`);
    }
    return data;
  }
}
```

### Plugin Profiling

```typescript
// plugins/profiler-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

export class ProfilerPlugin implements Plugin {
  name = 'profiler';
  version = '1.0.0';
  
  private metrics: Map<string, { count: number; totalTime: number }> = new Map();

  onData(data: Buffer, socket: Socket): Buffer {
    const startTime = process.hrtime.bigint();
    
    // Process data...
    const result = data;
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    const clientId = socket.remoteAddress;
    const metric = this.metrics.get(clientId) || { count: 0, totalTime: 0 };
    metric.count++;
    metric.totalTime += duration;
    this.metrics.set(clientId, metric);
    
    return result;
  }

  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  getAverageProcessingTime() {
    const totalCount = Array.from(this.metrics.values())
      .reduce((sum, metric) => sum + metric.count, 0);
    const totalTime = Array.from(this.metrics.values())
      .reduce((sum, metric) => sum + metric.totalTime, 0);
    
    return totalCount > 0 ? totalTime / totalCount : 0;
  }
}
```

## 📚 Additional Resources

- **[Plugin API Reference](./api.md)** - Complete plugin API documentation
- **[Plugin Examples](./examples.md)** - More plugin examples
- **[Plugin Testing Guide](./testing.md)** - Testing strategies
- **[Plugin Distribution](./distribution.md)** - Publishing plugins

---

<div align="center">

**Need help with plugin development?** [Ask a Question](https://github.com/your-org/tcp-udp-router/discussions) • [View Examples](./examples.md)

</div>