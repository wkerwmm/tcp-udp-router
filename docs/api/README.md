# API Reference

Complete API documentation for the TCP/UDP Router.

## 📋 Table of Contents

- [Core API](./core.md) - Main router classes and interfaces
- [Plugin API](./plugins.md) - Plugin development and lifecycle
- [Middleware API](./middleware.md) - Custom middleware creation
- [Metrics API](./metrics.md) - Monitoring and observability
- [Configuration API](./configuration.md) - Configuration interfaces
- [Types](./types.md) - TypeScript type definitions

## 🚀 Quick API Overview

### Core Classes

```typescript
import { 
  TCPRouter, 
  UDPRouter, 
  RouterConfig, 
  Plugin, 
  Middleware 
} from 'tcp-udp-router';

// Create a TCP router
const tcpRouter = new TCPRouter({
  port: 4000,
  plugins: ['logger', 'metrics'],
  middleware: [customMiddleware]
});

// Create a UDP router
const udpRouter = new UDPRouter({
  port: 5000,
  plugins: ['packet-logger']
});
```

### Plugin Interface

```typescript
interface Plugin {
  name: string;
  version: string;
  
  onConnect?(socket: Socket): void;
  onData?(data: Buffer, socket: Socket): Buffer | Promise<Buffer>;
  onDisconnect?(socket: Socket): void;
  onError?(error: Error): void;
}
```

### Middleware Function

```typescript
type Middleware = (
  data: Buffer, 
  socket: Socket, 
  next: (data?: Buffer) => void
) => void | Promise<void>;
```

## 📊 API Stability

| Component | Stability | Since Version |
|-----------|-----------|---------------|
| Core Router Classes | ✅ Stable | 1.0.0 |
| Plugin API | ✅ Stable | 1.0.0 |
| Middleware API | ✅ Stable | 1.0.0 |
| Metrics API | ✅ Stable | 1.0.0 |
| Configuration API | ✅ Stable | 1.0.0 |
| Advanced Features | 🔄 Evolving | 1.1.0 |

## 🔗 Related Documentation

- **[Getting Started](../getting-started/quick-start.md)** - Quick setup guide
- **[Configuration Guide](../configuration/README.md)** - Configuration options
- **[Plugin Development](../plugins/development.md)** - Creating plugins
- **[Monitoring](../monitoring/README.md)** - Metrics and observability

## 📝 API Versioning

The API follows [Semantic Versioning](https://semver.org/):

- **Major versions** (1.x.x): Breaking changes
- **Minor versions** (x.1.x): New features, backward compatible
- **Patch versions** (x.x.1): Bug fixes, backward compatible

### Deprecation Policy

- Deprecated APIs are marked with `@deprecated` JSDoc comments
- Deprecated APIs are supported for at least 2 major versions
- Migration guides are provided for breaking changes

## 🧪 API Examples

### Basic TCP Router

```typescript
import { TCPRouter } from 'tcp-udp-router';

const router = new TCPRouter({
  port: 4000,
  host: '0.0.0.0',
  maxConnections: 1000,
  connectionTimeout: 30000
});

router.on('connection', (socket) => {
  console.log('New connection:', socket.remoteAddress);
});

router.on('data', (data, socket) => {
  console.log('Received:', data.toString());
  socket.write(data); // Echo back
});

router.start();
```

### Plugin Development

```typescript
import { Plugin, Socket } from 'tcp-udp-router';

class LoggerPlugin implements Plugin {
  name = 'logger';
  version = '1.0.0';

  onConnect(socket: Socket) {
    console.log(`[${this.name}] Connection from ${socket.remoteAddress}`);
  }

  onData(data: Buffer, socket: Socket) {
    console.log(`[${this.name}] Data from ${socket.remoteAddress}:`, data.toString());
    return data; // Pass through unchanged
  }

  onDisconnect(socket: Socket) {
    console.log(`[${this.name}] Disconnection from ${socket.remoteAddress}`);
  }
}
```

### Custom Middleware

```typescript
import { Middleware } from 'tcp-udp-router';

const rateLimitMiddleware: Middleware = (data, socket, next) => {
  const clientId = socket.remoteAddress;
  const now = Date.now();
  
  // Simple rate limiting logic
  if (rateLimitMap.has(clientId)) {
    const lastRequest = rateLimitMap.get(clientId);
    if (now - lastRequest < 1000) { // 1 second limit
      socket.write(Buffer.from('Rate limit exceeded\n'));
      return;
    }
  }
  
  rateLimitMap.set(clientId, now);
  next(data);
};
```

## 🔍 API Search

Use the search functionality to quickly find specific APIs:

- **Classes**: `TCPRouter`, `UDPRouter`, `PluginManager`
- **Interfaces**: `RouterConfig`, `Plugin`, `Middleware`
- **Types**: `Socket`, `Buffer`, `RouterEvent`
- **Methods**: `start()`, `stop()`, `onData()`, `onConnect()`

## 📚 Additional Resources

- **[TypeScript Definitions](./types.md)** - Complete type definitions
- **[Migration Guides](../migration/README.md)** - Version migration help
- **[Best Practices](../best-practices/README.md)** - API usage guidelines
- **[Performance Tips](../performance/README.md)** - Optimization strategies

---

<div align="center">

**Need help with the API?** [Ask a Question](https://github.com/your-org/tcp-udp-router/discussions) • [Report an Issue](https://github.com/your-org/tcp-udp-router/issues)

</div>