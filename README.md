# TCP/UDP Router

A professional, high-performance TCP/UDP router with advanced features including plugin architecture, security controls, monitoring, and comprehensive observability.

## 🚀 Features

### Core Functionality
- **TCP & UDP Routing**: High-performance routing for both protocols
- **Plugin Architecture**: Extensible plugin system with hot-reloading
- **Security Controls**: IP whitelist/blacklist, rate limiting, connection limits
- **Health Monitoring**: Comprehensive health checks and metrics
- **Error Handling**: Robust error handling with retry logic and resource cleanup

### Observability
- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Metrics Collection**: Prometheus-compatible metrics
- **Tracing**: Request tracing and performance monitoring
- **Dashboards**: Grafana dashboards for visualization

### Deployment
- **Docker Support**: Multi-stage Docker builds with security best practices
- **Kubernetes**: Complete K8s manifests with HPA and monitoring
- **CI/CD**: GitHub Actions pipeline with testing and security scanning

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Plugin Development](#plugin-development)
- [Security Features](#security-features)
- [Monitoring & Observability](#monitoring--observability)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Contributing](#contributing)

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/tcp-udp-router.git
cd tcp-udp-router

# Install dependencies
npm install

# Build the project
npm run build

# Start the router
npm start
```

### Docker

```bash
# Build the image
docker build -t tcp-udp-router .

# Run with Docker Compose
docker-compose up -d
```

## ⚙️ Configuration

Configuration is managed through environment variables or `.env` files:

### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `TCP_PORT` | TCP server port | `4000` |
| `UDP_PORT` | UDP server port | `5000` |
| `HTTP_HEALTH_PORT` | Health check port | `8080` |
| `METRICS_PORT` | Metrics port | `3001` |
| `LOG_LEVEL` | Log level (error/warn/info/debug) | `info` |

### Security Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_IP_FILTERING` | Enable IP filtering | `false` |
| `ENABLE_RATE_LIMITING` | Enable rate limiting | `false` |
| `ENABLE_HEALTH_CHECK_AUTH` | Enable health check auth | `false` |
| `HEALTH_CHECK_SECRET` | Health check secret token | - |
| `MAX_CONNECTIONS_PER_IP` | Max connections per IP | `10` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | `60000` |

### Performance Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_CONNECTIONS` | Maximum total connections | `1000` |
| `CONNECTION_TIMEOUT` | Connection timeout (ms) | `30000` |
| `HEALTH_CHECK_INTERVAL` | Health check interval (ms) | `30000` |

## 📖 Usage Examples

### Basic TCP Echo Server

```typescript
import { TCPServer } from './src/net/tcpServer'
import { createContainer } from './src/container'

const container = createContainer()
const tcpServer = new TCPServer(4000, container)

await tcpServer.start()
console.log('TCP server listening on port 4000')
```

### UDP Message Handler

```typescript
import { UDPServer } from './src/net/udpServer'

const udpServer = new UDPServer(5000, container)
await udpServer.start()
console.log('UDP server listening on port 5000')
```

### Health Check

```bash
# Basic health check
curl http://localhost:8080/health

# Detailed health check (requires auth if enabled)
curl -H "Authorization: Bearer your-secret" http://localhost:8080/health/detailed
```

### Metrics

```bash
# Prometheus metrics
curl http://localhost:3001/metrics
```

## 🔌 Plugin Development

### Creating a Plugin

```typescript
import { BasePlugin, PluginContext, PluginConfig } from './src/plugins/pluginAPI'

export class MyPlugin extends BasePlugin {
  async process(context: PluginContext): Promise<PluginContext | null> {
    // Process the message
    this.log('info', 'Processing message', {
      sessionId: context.sessionId,
      dataSize: context.data.length
    })
    
    // Return modified context or null to block
    return context
  }
}

export const myPluginMetadata = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'My custom plugin',
  configSchema: {
    enabled: {
      type: 'boolean',
      default: true,
      description: 'Enable the plugin'
    }
  }
}
```

### Plugin API

The plugin API provides:

- **Lifecycle Methods**: `onInitialize()`, `onStart()`, `onStop()`
- **Processing Methods**: `process()`, `preProcess()`, `postProcess()`
- **Event Handlers**: `onConnection()`, `onDisconnection()`, `onMessage()`
- **Utilities**: Logging, metrics, configuration access

### Example Plugins

- **Logging Plugin**: Logs all incoming messages
- **Rate Limiting Plugin**: Implements rate limiting per IP/session
- **Header Parser Plugin**: Parses custom headers from messages

## 🔒 Security Features

### IP Filtering

```typescript
// Add IP to whitelist
securityManager.addIPRule({
  address: '192.168.1.0/24',
  type: 'whitelist',
  description: 'Internal network'
})

// Block specific IP
securityManager.addIPRule({
  address: '10.0.0.100',
  type: 'blacklist',
  description: 'Blocked IP'
})
```

### Rate Limiting

```typescript
// Set custom rate limit
securityManager.setRateLimit('user-123', 100, 60000) // 100 requests per minute

// Block IP temporarily
securityManager.blockIP('192.168.1.100', 300000) // Block for 5 minutes
```

### Health Check Authentication

```bash
# Enable health check auth
export ENABLE_HEALTH_CHECK_AUTH=true
export HEALTH_CHECK_SECRET=your-secret-token

# Access detailed health check
curl -H "Authorization: Bearer your-secret-token" \
     http://localhost:8080/health/detailed
```

## 📊 Monitoring & Observability

### Metrics

The router exposes Prometheus metrics:

- `tcp_connections_total` - Active TCP connections
- `udp_connections_total` - Active UDP connections  
- `messages_processed_total` - Messages processed by protocol
- `processing_time_seconds` - Message processing time
- `errors_total` - Error counts by type
- `router_matches_total` - Router rule matches

### Logging

Structured JSON logging with correlation IDs:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Message processed",
  "service": "tcp-udp-router",
  "correlationId": "abc-123-def",
  "sessionId": "session-456",
  "protocol": "tcp",
  "remoteAddress": "192.168.1.100",
  "duration": 15
}
```

### Tracing

Request tracing with correlation IDs:

```typescript
const tracer = correlationManager.trace('process-message', context, () => {
  // Your processing logic
  return result
})
```

### Grafana Dashboard

Pre-configured Grafana dashboard includes:

- Connection counts and throughput
- Latency percentiles (P50, P95, P99)
- Error rates and types
- System resource usage
- Message size distribution

## 🚀 Deployment

### Docker

```bash
# Build image
docker build -t tcp-udp-router .

# Run container
docker run -p 4000:4000 -p 5000:5000 -p 8080:8080 tcp-udp-router
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# Services included:
# - tcp-udp-router (main application)
# - prometheus (metrics collection)
# - grafana (dashboards)
# - redis (caching)
```

### Kubernetes

```bash
# Deploy to Kubernetes
kubectl apply -f deployment/kubernetes/

# Check deployment
kubectl get pods -n tcp-udp-router
kubectl get services -n tcp-udp-router
```

### Production Considerations

- **Resource Limits**: Set appropriate CPU/memory limits
- **Health Checks**: Configure liveness and readiness probes
- **Scaling**: Use Horizontal Pod Autoscaler (HPA)
- **Monitoring**: Enable Prometheus scraping and alerts
- **Security**: Use network policies and RBAC

## 🧪 Testing

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

### Performance Testing

```bash
# Run benchmark
npm run benchmark:load

# Stress test
npm run benchmark:stress

# Custom benchmark
npm run benchmark run -d 60 -c 10 -p tcp
```

### Test Coverage

```bash
npm run test:coverage
```

## 📚 API Reference

### Core Classes

- `TCPServer` - TCP server implementation
- `UDPServer` - UDP server implementation  
- `Router` - Message routing engine
- `PluginManager` - Plugin lifecycle management
- `SecurityManager` - Security controls
- `ErrorHandler` - Error handling and retry logic

### Configuration

- `Config` - Application configuration interface
- `SecurityConfig` - Security settings
- `PluginConfig` - Plugin configuration

### Monitoring

- `MetricsCollector` - Prometheus metrics
- `CorrelationManager` - Request tracing
- `PerformanceMonitor` - System monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Wiki](https://github.com/your-org/tcp-udp-router/wiki)
- **Issues**: [GitHub Issues](https://github.com/your-org/tcp-udp-router/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/tcp-udp-router/discussions)

## 🗺️ Roadmap

- [ ] WebSocket support
- [ ] gRPC routing
- [ ] Advanced load balancing
- [ ] Circuit breaker patterns
- [ ] Distributed tracing with Jaeger
- [ ] Configuration management with Consul
- [ ] Service mesh integration

---

Made with ❤️ by the TCP/UDP Router Team
