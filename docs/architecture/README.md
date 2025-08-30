# Architecture Guide

Complete architecture documentation for the TCP/UDP Router.

## 📋 Table of Contents

- [System Overview](./overview.md) - High-level system design
- [Data Flow](./data-flow.md) - How data flows through the system
- [Performance](./performance.md) - Performance considerations
- [Scalability](./scalability.md) - Scaling strategies
- [Security](./security.md) - Security architecture
- [Monitoring](./monitoring.md) - Observability design

## 🏗️ System Architecture

### High-Level Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TCP Clients   │    │   UDP Clients   │    │  HTTP Clients   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TCP/UDP Router                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ TCP Server  │  │ UDP Server  │  │ HTTP Server │            │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│         │                 │                │                   │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐            │
│  │ Middleware  │  │ Middleware  │  │ Health API  │            │
│  │  Pipeline   │  │  Pipeline   │  │  Metrics    │            │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘            │
│         │                 │                                   │
│  ┌──────▼──────┐  ┌──────▼──────┐                            │
│  │   Plugin    │  │   Plugin    │                            │
│  │   System    │  │   System    │                            │
│  └─────────────┘  └─────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Server Layer
- **TCP Server**: Handles TCP connections with connection pooling
- **UDP Server**: Handles UDP packets with efficient buffering
- **HTTP Server**: Provides health checks and metrics endpoints

#### 2. Middleware Layer
- **Pipeline**: Processes data through configurable middleware chain
- **Built-in Middleware**: Rate limiting, authentication, logging
- **Custom Middleware**: User-defined processing logic

#### 3. Plugin Layer
- **Plugin Manager**: Loads, manages, and orchestrates plugins
- **Plugin Interface**: Standardized plugin API
- **Plugin Lifecycle**: Load, initialize, execute, cleanup

#### 4. Monitoring Layer
- **Metrics Collection**: Prometheus-compatible metrics
- **Health Checks**: Liveness and readiness probes
- **Logging**: Structured logging with multiple outputs

## 🔄 Data Flow Architecture

### TCP Data Flow

```
Client Connection
       │
       ▼
┌─────────────┐
│ TCP Server  │ ← Accept connection
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Connection  │ ← Create connection object
│   Pool      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Middleware  │ ← Process through middleware chain
│  Pipeline   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Plugin    │ ← Execute plugins
│   System    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Response    │ ← Send response back
│  Handler    │
└─────────────┘
```

### UDP Data Flow

```
UDP Packet
    │
    ▼
┌─────────────┐
│ UDP Server  │ ← Receive packet
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Packet      │ ← Create packet object
│  Buffer     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Middleware  │ ← Process through middleware
│  Pipeline   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Plugin    │ ← Execute plugins
│   System    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Response    │ ← Send response packet
│  Handler    │
└─────────────┘
```

## 🏛️ Component Architecture

### 1. Router Core

```typescript
// Core router interface
interface Router {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getStats(): RouterStats;
}

// TCP Router implementation
class TCPRouter implements Router {
  private server: net.Server;
  private middleware: Middleware[];
  private plugins: Plugin[];
  private connectionPool: ConnectionPool;
  
  constructor(config: RouterConfig) {
    this.server = net.createServer();
    this.middleware = config.middleware || [];
    this.plugins = config.plugins || [];
    this.connectionPool = new ConnectionPool(config.maxConnections);
  }
  
  async start(): Promise<void> {
    // Implementation
  }
}
```

### 2. Middleware System

```typescript
// Middleware interface
type Middleware = (
  data: Buffer,
  context: MiddlewareContext,
  next: NextFunction
) => void | Promise<void>;

// Middleware context
interface MiddlewareContext {
  socket: Socket;
  protocol: 'tcp' | 'udp';
  timestamp: number;
  metadata: Record<string, any>;
}

// Middleware pipeline
class MiddlewarePipeline {
  private middleware: Middleware[] = [];
  
  use(middleware: Middleware): void {
    this.middleware.push(middleware);
  }
  
  async execute(data: Buffer, context: MiddlewareContext): Promise<Buffer> {
    let index = 0;
    
    const next = async (): Promise<Buffer> => {
      if (index >= this.middleware.length) {
        return data;
      }
      
      const current = this.middleware[index++];
      return await current(data, context, next);
    };
    
    return await next();
  }
}
```

### 3. Plugin System

```typescript
// Plugin interface
interface Plugin {
  name: string;
  version: string;
  onLoad?(config: PluginConfig): void | Promise<void>;
  onUnload?(): void | Promise<void>;
  onConnect?(socket: Socket): void;
  onData?(data: Buffer, socket: Socket): Buffer | Promise<Buffer>;
  onDisconnect?(socket: Socket): void;
  onError?(error: Error): void;
}

// Plugin manager
class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private config: PluginConfig;
  
  async loadPlugin(pluginPath: string): Promise<void> {
    const plugin = await import(pluginPath);
    const instance = new plugin.default();
    
    if (instance.onLoad) {
      await instance.onLoad(this.config);
    }
    
    this.plugins.set(instance.name, instance);
  }
  
  async executePlugins(event: string, data: any): Promise<any> {
    for (const plugin of this.plugins.values()) {
      if (plugin[event]) {
        data = await plugin[event](data);
      }
    }
    return data;
  }
}
```

### 4. Connection Management

```typescript
// Connection pool
class ConnectionPool {
  private connections: Map<string, Connection> = new Map();
  private maxConnections: number;
  
  constructor(maxConnections: number) {
    this.maxConnections = maxConnections;
  }
  
  addConnection(id: string, connection: Connection): boolean {
    if (this.connections.size >= this.maxConnections) {
      return false;
    }
    
    this.connections.set(id, connection);
    return true;
  }
  
  removeConnection(id: string): void {
    this.connections.delete(id);
  }
  
  getConnection(id: string): Connection | undefined {
    return this.connections.get(id);
  }
  
  getStats(): ConnectionStats {
    return {
      total: this.connections.size,
      max: this.maxConnections,
      active: Array.from(this.connections.values()).filter(c => c.isActive()).length
    };
  }
}
```

## 📊 Performance Architecture

### 1. Event-Driven Architecture

```typescript
// Event emitter for router events
class RouterEventEmitter extends EventEmitter {
  emit(event: string, ...args: any[]): boolean {
    // Add performance monitoring
    const start = process.hrtime.bigint();
    const result = super.emit(event, ...args);
    const end = process.hrtime.bigint();
    
    // Record event timing
    this.recordEventTiming(event, Number(end - start) / 1000000);
    
    return result;
  }
  
  private recordEventTiming(event: string, duration: number): void {
    // Implementation for metrics collection
  }
}
```

### 2. Buffer Management

```typescript
// Efficient buffer handling
class BufferManager {
  private pool: Buffer[] = [];
  private maxPoolSize: number;
  
  constructor(maxPoolSize: number = 1000) {
    this.maxPoolSize = maxPoolSize;
  }
  
  allocate(size: number): Buffer {
    // Try to reuse buffer from pool
    const index = this.pool.findIndex(buf => buf.length >= size);
    if (index !== -1) {
      return this.pool.splice(index, 1)[0];
    }
    
    // Create new buffer if pool is empty
    return Buffer.allocUnsafe(size);
  }
  
  release(buffer: Buffer): void {
    if (this.pool.length < this.maxPoolSize) {
      this.pool.push(buffer);
    }
  }
}
```

### 3. Async Processing

```typescript
// Worker thread pool for heavy processing
class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{task: any, resolve: Function, reject: Function}> = [];
  private maxWorkers: number;
  
  constructor(maxWorkers: number = 4) {
    this.maxWorkers = maxWorkers;
    this.initializeWorkers();
  }
  
  private initializeWorkers(): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker('./worker.js');
      worker.on('message', this.handleWorkerMessage.bind(this));
      this.workers.push(worker);
    }
  }
  
  async execute(task: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }
  
  private processQueue(): void {
    // Implementation for queue processing
  }
}
```

## 🔒 Security Architecture

### 1. Authentication & Authorization

```typescript
// Authentication middleware
class AuthMiddleware implements Middleware {
  private authProvider: AuthProvider;
  
  constructor(authProvider: AuthProvider) {
    this.authProvider = authProvider;
  }
  
  async execute(data: Buffer, context: MiddlewareContext, next: NextFunction): Promise<Buffer> {
    // Extract authentication token
    const token = this.extractToken(data);
    
    if (!token) {
      throw new AuthError('No authentication token provided');
    }
    
    // Validate token
    const user = await this.authProvider.validateToken(token);
    if (!user) {
      throw new AuthError('Invalid authentication token');
    }
    
    // Add user to context
    context.metadata.user = user;
    
    return await next();
  }
  
  private extractToken(data: Buffer): string | null {
    // Implementation for token extraction
  }
}
```

### 2. Rate Limiting

```typescript
// Rate limiting middleware
class RateLimitMiddleware implements Middleware {
  private limits: Map<string, RateLimitInfo> = new Map();
  private windowMs: number;
  private maxRequests: number;
  
  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }
  
  async execute(data: Buffer, context: MiddlewareContext, next: NextFunction): Promise<Buffer> {
    const clientId = context.socket.remoteAddress;
    const now = Date.now();
    
    // Get or create rate limit info
    let limitInfo = this.limits.get(clientId);
    if (!limitInfo || now > limitInfo.resetTime) {
      limitInfo = {
        count: 0,
        resetTime: now + this.windowMs
      };
      this.limits.set(clientId, limitInfo);
    }
    
    // Check rate limit
    if (limitInfo.count >= this.maxRequests) {
      throw new RateLimitError('Rate limit exceeded');
    }
    
    // Increment counter
    limitInfo.count++;
    
    return await next();
  }
}
```

### 3. Encryption

```typescript
// Encryption plugin
class EncryptionPlugin implements Plugin {
  name = 'encryption';
  version = '1.0.0';
  
  private algorithm: string;
  private key: Buffer;
  
  constructor(algorithm: string, key: Buffer) {
    this.algorithm = algorithm;
    this.key = key;
  }
  
  async onData(data: Buffer, socket: Socket): Promise<Buffer> {
    // Decrypt incoming data
    const decrypted = this.decrypt(data);
    
    // Process decrypted data
    const processed = await this.processData(decrypted);
    
    // Encrypt response
    return this.encrypt(processed);
  }
  
  private decrypt(data: Buffer): Buffer {
    // Implementation for decryption
  }
  
  private encrypt(data: Buffer): Buffer {
    // Implementation for encryption
  }
}
```

## 📈 Scalability Architecture

### 1. Horizontal Scaling

```typescript
// Load balancer integration
class LoadBalancerPlugin implements Plugin {
  name = 'load-balancer';
  version = '1.0.0';
  
  private backendServers: string[];
  private currentIndex: number = 0;
  
  constructor(backendServers: string[]) {
    this.backendServers = backendServers;
  }
  
  async onData(data: Buffer, socket: Socket): Promise<Buffer> {
    // Select backend server using round-robin
    const backend = this.backendServers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.backendServers.length;
    
    // Forward request to backend
    return await this.forwardToBackend(backend, data);
  }
  
  private async forwardToBackend(backend: string, data: Buffer): Promise<Buffer> {
    // Implementation for backend forwarding
  }
}
```

### 2. Clustering

```typescript
// Cluster manager
class ClusterManager {
  private workers: Worker[] = [];
  private numCPUs: number;
  
  constructor() {
    this.numCPUs = require('os').cpus().length;
  }
  
  start(): void {
    if (cluster.isPrimary) {
      // Fork workers
      for (let i = 0; i < this.numCPUs; i++) {
        const worker = cluster.fork();
        this.workers.push(worker);
      }
      
      // Handle worker events
      cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        // Restart worker
        const newWorker = cluster.fork();
        this.workers.push(newWorker);
      });
    } else {
      // Worker process
      this.startWorker();
    }
  }
  
  private startWorker(): void {
    // Start router in worker process
    const router = new TCPRouter(config);
    router.start();
  }
}
```

### 3. Caching

```typescript
// Cache manager
class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttl: number;
  
  constructor(maxSize: number = 1000, ttl: number = 300000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  set(key: string, value: any, ttl?: number): void {
    // Implement LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl || this.ttl)
    });
  }
}
```

## 📊 Monitoring Architecture

### 1. Metrics Collection

```typescript
// Metrics collector
class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  
  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }
  
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }
  
  recordHistogram(name: string, value: number): void {
    const histogram = this.histograms.get(name) || [];
    histogram.push(value);
    this.histograms.set(name, histogram);
  }
  
  getMetrics(): string {
    // Format metrics in Prometheus format
    let output = '';
    
    // Counters
    for (const [name, value] of this.counters) {
      output += `# TYPE ${name} counter\n`;
      output += `${name} ${value}\n`;
    }
    
    // Gauges
    for (const [name, value] of this.gauges) {
      output += `# TYPE ${name} gauge\n`;
      output += `${name} ${value}\n`;
    }
    
    return output;
  }
}
```

### 2. Health Checks

```typescript
// Health check system
class HealthCheckSystem {
  private checks: Map<string, HealthCheck> = new Map();
  
  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }
  
  async runChecks(): Promise<HealthStatus> {
    const results: Record<string, HealthCheckResult> = {};
    
    for (const [name, check] of this.checks) {
      try {
        const result = await check.execute();
        results[name] = result;
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          message: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    const overallStatus = Object.values(results).every(r => r.status === 'healthy')
      ? 'healthy' : 'unhealthy';
    
    return {
      status: overallStatus,
      checks: results,
      timestamp: new Date().toISOString()
    };
  }
}
```

## 📚 Additional Resources

- **[System Overview](./overview.md)** - Detailed system design
- **[Data Flow](./data-flow.md)** - Data processing flow
- **[Performance Guide](./performance.md)** - Performance optimization
- **[Scaling Guide](./scalability.md)** - Scaling strategies
- **[Security Guide](./security.md)** - Security architecture
- **[Monitoring Guide](./monitoring.md)** - Observability design

---

<div align="center">

**Need help with architecture?** [Ask a Question](https://github.com/your-org/tcp-udp-router/discussions) • [View Examples](../examples/architecture.md)

</div>