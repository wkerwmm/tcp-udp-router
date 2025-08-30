# Examples Guide

Practical examples and use cases for the TCP/UDP Router.

## 📋 Table of Contents

- [Basic Examples](./basic.md) - Simple router configurations
- [Plugin Examples](./plugins.md) - Custom plugin implementations
- [Middleware Examples](./middleware.md) - Custom middleware examples
- [Deployment Examples](./deployment.md) - Production deployment examples
- [Monitoring Examples](./monitoring.md) - Monitoring and observability examples
- [Advanced Examples](./advanced.md) - Complex use cases

## 🚀 Quick Examples

### Basic TCP Echo Server

```typescript
// examples/basic/tcp-echo.ts
import { TCPRouter } from 'tcp-udp-router';

const router = new TCPRouter({
  port: 4000,
  host: '0.0.0.0'
});

router.on('connection', (socket) => {
  console.log('New connection:', socket.remoteAddress);
});

router.on('data', (data, socket) => {
  console.log('Received:', data.toString());
  socket.write(data); // Echo back
});

router.start().then(() => {
  console.log('TCP Echo server running on port 4000');
});
```

### UDP Packet Logger

```typescript
// examples/basic/udp-logger.ts
import { UDPRouter } from 'tcp-udp-router';

const router = new UDPRouter({
  port: 5000,
  host: '0.0.0.0'
});

router.on('message', (message, rinfo) => {
  console.log(`UDP packet from ${rinfo.address}:${rinfo.port}`);
  console.log('Data:', message.toString());
});

router.start().then(() => {
  console.log('UDP Logger running on port 5000');
});
```

## 🔌 Plugin Examples

### Authentication Plugin

```typescript
// examples/plugins/auth-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

export class AuthPlugin implements Plugin {
  name = 'auth';
  version = '1.0.0';
  
  private validTokens: Set<string>;

  constructor(tokens: string[]) {
    this.validTokens = new Set(tokens);
  }

  onConnect(socket: Socket) {
    (socket as any).authenticated = false;
  }

  onData(data: Buffer, socket: Socket): Buffer | null {
    const message = data.toString();
    
    if (!(socket as any).authenticated) {
      if (message.startsWith('AUTH:')) {
        const token = message.substring(5);
        if (this.validTokens.has(token)) {
          (socket as any).authenticated = true;
          socket.write(Buffer.from('AUTH_OK\n'));
          return null;
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
    
    return data;
  }
}

// Usage
const router = new TCPRouter({
  port: 4000,
  plugins: [new AuthPlugin(['secret-token-1', 'secret-token-2'])]
});
```

### Rate Limiting Plugin

```typescript
// examples/plugins/rate-limit-plugin.ts
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
    
    let clientRecord = this.requestCounts.get(clientId);
    if (!clientRecord || now > clientRecord.resetTime) {
      clientRecord = { count: 0, resetTime: now + this.config.windowMs };
      this.requestCounts.set(clientId, clientRecord);
    }
    
    if (clientRecord.count >= this.config.maxRequests) {
      socket.write(Buffer.from('RATE_LIMIT_EXCEEDED\n'));
      return null;
    }
    
    clientRecord.count++;
    return data;
  }

  onDisconnect(socket: Socket) {
    this.requestCounts.delete(socket.remoteAddress);
  }
}

// Usage
const router = new TCPRouter({
  port: 4000,
  plugins: [new RateLimitPlugin({ windowMs: 60000, maxRequests: 100 })]
});
```

### Data Transformation Plugin

```typescript
// examples/plugins/transform-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

export class TransformPlugin implements Plugin {
  name = 'transform';
  version = '1.0.0';
  
  private transformFunction: (data: Buffer) => Buffer;

  constructor(transformFunction: (data: Buffer) => Buffer) {
    this.transformFunction = transformFunction;
  }

  onData(data: Buffer, socket: Socket): Buffer {
    return this.transformFunction(data);
  }
}

// Usage examples
const upperCasePlugin = new TransformPlugin((data) => 
  Buffer.from(data.toString().toUpperCase())
);

const reversePlugin = new TransformPlugin((data) => 
  Buffer.from(data.toString().split('').reverse().join(''))
);

const router = new TCPRouter({
  port: 4000,
  plugins: [upperCasePlugin, reversePlugin]
});
```

## 🔧 Middleware Examples

### Logging Middleware

```typescript
// examples/middleware/logging-middleware.ts
import { Middleware } from 'tcp-udp-router';

export const loggingMiddleware: Middleware = (data, socket, next) => {
  const timestamp = new Date().toISOString();
  const clientId = socket.remoteAddress;
  
  console.log(`[${timestamp}] [${clientId}] Received: ${data.length} bytes`);
  
  const startTime = process.hrtime.bigint();
  
  next(data).then((result) => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    
    console.log(`[${timestamp}] [${clientId}] Processed in ${duration}ms`);
    return result;
  });
};

// Usage
const router = new TCPRouter({
  port: 4000,
  middleware: [loggingMiddleware]
});
```

### Compression Middleware

```typescript
// examples/middleware/compression-middleware.ts
import { Middleware } from 'tcp-udp-router';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const compressionMiddleware: Middleware = async (data, socket, next) => {
  // Check if data is compressed
  if (data[0] === 0x1f && data[1] === 0x8b) {
    // Decompress incoming data
    const decompressed = await gunzipAsync(data);
    const result = await next(decompressed);
    
    // Compress response
    return await gzipAsync(result);
  } else {
    // Pass through uncompressed data
    return await next(data);
  }
};

// Usage
const router = new TCPRouter({
  port: 4000,
  middleware: [compressionMiddleware]
});
```

### Validation Middleware

```typescript
// examples/middleware/validation-middleware.ts
import { Middleware } from 'tcp-udp-router';
import { z } from 'zod';

const messageSchema = z.object({
  type: z.enum(['request', 'response']),
  data: z.string().min(1),
  timestamp: z.number()
});

export const validationMiddleware: Middleware = async (data, socket, next) => {
  try {
    const message = JSON.parse(data.toString());
    const validated = messageSchema.parse(message);
    
    return await next(Buffer.from(JSON.stringify(validated)));
  } catch (error) {
    socket.write(Buffer.from(JSON.stringify({
      error: 'Invalid message format',
      details: error.message
    })));
    return null;
  }
};

// Usage
const router = new TCPRouter({
  port: 4000,
  middleware: [validationMiddleware]
});
```

## 🐳 Deployment Examples

### Docker Compose with Monitoring

```yaml
# examples/deployment/docker-compose.yml
version: '3.8'

services:
  tcp-udp-router:
    build: .
    ports:
      - "4000:4000"  # TCP
      - "5000:5000"  # UDP
      - "3001:3001"  # Metrics
      - "8080:8080"  # Health
    environment:
      - NODE_ENV=production
      - TCP_PORT=4000
      - UDP_PORT=5000
      - METRICS_PORT=3001
      - HTTP_HEALTH_PORT=8080
      - LOG_LEVEL=info
      - METRICS_ENABLED=true
      - ENABLE_HTTP_HEALTH=true
    volumes:
      - ./plugins:/app/plugins:ro
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
```

### Kubernetes Deployment

```yaml
# examples/deployment/k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tcp-udp-router
  labels:
    app: tcp-udp-router
spec:
  replicas: 3
  selector:
    matchLabels:
      app: tcp-udp-router
  template:
    metadata:
      labels:
        app: tcp-udp-router
    spec:
      containers:
      - name: tcp-udp-router
        image: your-org/tcp-udp-router:latest
        ports:
        - containerPort: 4000
          name: tcp
        - containerPort: 5000
          name: udp
        - containerPort: 3001
          name: metrics
        - containerPort: 8080
          name: health
        env:
        - name: NODE_ENV
          value: "production"
        - name: TCP_PORT
          value: "4000"
        - name: UDP_PORT
          value: "5000"
        - name: METRICS_PORT
          value: "3001"
        - name: HTTP_HEALTH_PORT
          value: "8080"
        - name: LOG_LEVEL
          value: "info"
        - name: METRICS_ENABLED
          value: "true"
        - name: ENABLE_HTTP_HEALTH
          value: "true"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
        volumeMounts:
        - name: plugins
          mountPath: /app/plugins
          readOnly: true
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: plugins
        configMap:
          name: tcp-udp-router-plugins
      - name: logs
        emptyDir: {}
```

## 📊 Monitoring Examples

### Custom Metrics Plugin

```typescript
// examples/monitoring/custom-metrics-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';

export class CustomMetricsPlugin implements Plugin {
  name = 'custom-metrics';
  version = '1.0.0';
  
  private metrics = {
    totalConnections: 0,
    activeConnections: 0,
    totalDataTransferred: 0,
    averageResponseTime: 0,
    responseTimes: [] as number[]
  };

  onConnect(socket: Socket) {
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
  }

  onData(data: Buffer, socket: Socket): Buffer {
    const startTime = process.hrtime.bigint();
    
    // Process data
    const result = data;
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    
    // Update metrics
    this.metrics.totalDataTransferred += data.length;
    this.metrics.responseTimes.push(duration);
    
    // Keep only last 1000 response times
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }
    
    // Calculate average
    this.metrics.averageResponseTime = 
      this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length;
    
    return result;
  }

  onDisconnect(socket: Socket) {
    this.metrics.activeConnections--;
  }

  getMetrics(): string {
    return `
# HELP custom_total_connections Total number of connections
# TYPE custom_total_connections counter
custom_total_connections ${this.metrics.totalConnections}

# HELP custom_active_connections Active connections
# TYPE custom_active_connections gauge
custom_active_connections ${this.metrics.activeConnections}

# HELP custom_data_transferred Total data transferred in bytes
# TYPE custom_data_transferred counter
custom_data_transferred ${this.metrics.totalDataTransferred}

# HELP custom_average_response_time Average response time in milliseconds
# TYPE custom_average_response_time gauge
custom_average_response_time ${this.metrics.averageResponseTime}
`;
  }
}
```

### Health Check Plugin

```typescript
// examples/monitoring/health-check-plugin.ts
import { Plugin } from 'tcp-udp-router';

export class HealthCheckPlugin implements Plugin {
  name = 'health-check';
  version = '1.0.0';
  
  private checks: Map<string, () => Promise<boolean>> = new Map();

  constructor() {
    this.registerDefaultChecks();
  }

  private registerDefaultChecks() {
    // Memory usage check
    this.checks.set('memory', async () => {
      const used = process.memoryUsage();
      const maxHeap = 512 * 1024 * 1024; // 512MB
      return used.heapUsed < maxHeap;
    });

    // CPU usage check
    this.checks.set('cpu', async () => {
      const startUsage = process.cpuUsage();
      await new Promise(resolve => setTimeout(resolve, 100));
      const endUsage = process.cpuUsage(startUsage);
      const cpuPercent = (endUsage.user + endUsage.system) / 1000000;
      return cpuPercent < 80; // Less than 80% CPU usage
    });

    // Disk space check
    this.checks.set('disk', async () => {
      const fs = require('fs').promises;
      const stats = await fs.stat('/');
      const freeSpace = stats.blocks * 512; // Convert to bytes
      const minSpace = 100 * 1024 * 1024; // 100MB
      return freeSpace > minSpace;
    });
  }

  async runHealthChecks(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [name, check] of this.checks) {
      try {
        results[name] = await check();
      } catch (error) {
        console.error(`Health check ${name} failed:`, error);
        results[name] = false;
      }
    }
    
    return results;
  }

  getHealthStatus(): { status: string; checks: Record<string, boolean> } {
    const checks = this.runHealthChecks();
    const allHealthy = Object.values(checks).every(check => check);
    
    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks
    };
  }
}
```

## 🔐 Security Examples

### TLS/SSL Configuration

```typescript
// examples/security/tls-router.ts
import { TCPRouter } from 'tcp-udp-router';
import { readFileSync } from 'fs';

const router = new TCPRouter({
  port: 4000,
  host: '0.0.0.0',
  tls: {
    cert: readFileSync('./certs/server.crt'),
    key: readFileSync('./certs/server.key'),
    ca: readFileSync('./certs/ca.crt'),
    minVersion: 'TLSv1.2',
    ciphers: 'ECDHE-RSA-AES256-GCM-SHA384'
  }
});

router.start().then(() => {
  console.log('TLS-enabled TCP router running on port 4000');
});
```

### JWT Authentication Plugin

```typescript
// examples/security/jwt-auth-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';
import jwt from 'jsonwebtoken';

export class JWTAuthPlugin implements Plugin {
  name = 'jwt-auth';
  version = '1.0.0';
  
  private secret: string;
  private algorithm: string;

  constructor(secret: string, algorithm: string = 'HS256') {
    this.secret = secret;
    this.algorithm = algorithm;
  }

  onConnect(socket: Socket) {
    (socket as any).authenticated = false;
    (socket as any).user = null;
  }

  onData(data: Buffer, socket: Socket): Buffer | null {
    const message = data.toString();
    
    if (!(socket as any).authenticated) {
      if (message.startsWith('JWT:')) {
        const token = message.substring(4);
        
        try {
          const decoded = jwt.verify(token, this.secret, { algorithms: [this.algorithm] });
          (socket as any).authenticated = true;
          (socket as any).user = decoded;
          socket.write(Buffer.from('AUTH_OK\n'));
          return null;
        } catch (error) {
          socket.write(Buffer.from('AUTH_FAILED\n'));
          socket.destroy();
          return null;
        }
      } else {
        socket.write(Buffer.from('JWT_REQUIRED\n'));
        socket.destroy();
        return null;
      }
    }
    
    return data;
  }
}

// Usage
const router = new TCPRouter({
  port: 4000,
  plugins: [new JWTAuthPlugin('your-secret-key')]
});
```

## 📈 Performance Examples

### Load Balancing Plugin

```typescript
// examples/performance/load-balancer-plugin.ts
import { Plugin, Socket } from 'tcp-udp-router';
import { createConnection } from 'net';

interface BackendServer {
  host: string;
  port: number;
  weight: number;
  active: boolean;
}

export class LoadBalancerPlugin implements Plugin {
  name = 'load-balancer';
  version = '1.0.0';
  
  private backends: BackendServer[];
  private currentIndex: number = 0;

  constructor(backends: BackendServer[]) {
    this.backends = backends;
  }

  async onData(data: Buffer, socket: Socket): Promise<Buffer> {
    const backend = this.selectBackend();
    
    if (!backend) {
      throw new Error('No available backend servers');
    }
    
    return await this.forwardToBackend(backend, data);
  }

  private selectBackend(): BackendServer | null {
    // Round-robin selection
    for (let i = 0; i < this.backends.length; i++) {
      const index = (this.currentIndex + i) % this.backends.length;
      const backend = this.backends[index];
      
      if (backend.active) {
        this.currentIndex = (index + 1) % this.backends.length;
        return backend;
      }
    }
    
    return null;
  }

  private async forwardToBackend(backend: BackendServer, data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const connection = createConnection(backend.port, backend.host);
      
      connection.on('connect', () => {
        connection.write(data);
      });
      
      connection.on('data', (response) => {
        connection.destroy();
        resolve(response);
      });
      
      connection.on('error', (error) => {
        connection.destroy();
        reject(error);
      });
      
      // Timeout
      setTimeout(() => {
        connection.destroy();
        reject(new Error('Backend timeout'));
      }, 5000);
    });
  }
}

// Usage
const router = new TCPRouter({
  port: 4000,
  plugins: [new LoadBalancerPlugin([
    { host: 'backend1.example.com', port: 4001, weight: 1, active: true },
    { host: 'backend2.example.com', port: 4002, weight: 1, active: true },
    { host: 'backend3.example.com', port: 4003, weight: 1, active: true }
  ])]
});
```

## 📚 Additional Resources

- **[Basic Examples](./basic.md)** - Simple configurations
- **[Plugin Examples](./plugins.md)** - Plugin implementations
- **[Middleware Examples](./middleware.md)** - Middleware examples
- **[Deployment Examples](./deployment.md)** - Production deployments
- **[Monitoring Examples](./monitoring.md)** - Observability examples
- **[Advanced Examples](./advanced.md)** - Complex use cases

---

<div align="center">

**Need help with examples?** [Ask a Question](https://github.com/your-org/tcp-udp-router/discussions) • [View More Examples](./advanced.md)

</div>