# Configuration Guide

Complete configuration reference for the TCP/UDP Router.

## 📋 Table of Contents

- [Environment Variables](./environment.md) - All configuration options
- [Plugin Configuration](./plugins.md) - Plugin setup and management
- [Network Configuration](./network.md) - TCP/UDP settings
- [Security Configuration](./security.md) - Security best practices
- [Performance Tuning](./performance.md) - Performance optimization
- [Logging Configuration](./logging.md) - Logging setup

## 🚀 Quick Configuration

### Basic Setup

Create a `.env` file in your project root:

```env
# Server Configuration
PORT=3000
TCP_PORT=4000
UDP_PORT=5000
HOST=0.0.0.0

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Metrics
METRICS_ENABLED=true
METRICS_PORT=3001

# Health Checks
ENABLE_HTTP_HEALTH=true
HTTP_HEALTH_PORT=8080

# Performance
MAX_CONNECTIONS=1000
CONNECTION_TIMEOUT=30000
```

### Advanced Configuration

```env
# Advanced Server Settings
BACKLOG=511
KEEP_ALIVE=true
KEEP_ALIVE_INITIAL_DELAY=30000

# Plugin Configuration
PLUGIN_DIR=./plugins
PLUGIN_AUTO_RELOAD=true
PLUGIN_TIMEOUT=5000

# Security
ENABLE_TLS=false
TLS_CERT_PATH=./certs/server.crt
TLS_KEY_PATH=./certs/server.key
TLS_CA_PATH=./certs/ca.crt

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090
GRAFANA_ENABLED=false
GRAFANA_PORT=3000
```

## 🔧 Configuration Methods

### 1. Environment Variables (Recommended)

```bash
# Set environment variables
export TCP_PORT=4000
export UDP_PORT=5000
export LOG_LEVEL=debug

# Run the router
npm start
```

### 2. .env File

```env
# .env file
TCP_PORT=4000
UDP_PORT=5000
LOG_LEVEL=debug
METRICS_ENABLED=true
```

### 3. Configuration File

```typescript
// config/router.config.ts
import { RouterConfig } from 'tcp-udp-router';

export const config: RouterConfig = {
  tcp: {
    port: 4000,
    host: '0.0.0.0',
    maxConnections: 1000,
    connectionTimeout: 30000
  },
  udp: {
    port: 5000,
    host: '0.0.0.0',
    maxPacketSize: 65507
  },
  plugins: ['logger', 'metrics'],
  middleware: [rateLimitMiddleware],
  metrics: {
    enabled: true,
    port: 3001
  }
};
```

### 4. Command Line Arguments

```bash
# Using command line arguments
npm start -- --tcp-port=4000 --udp-port=5000 --log-level=debug

# Or with environment variables
TCP_PORT=4000 UDP_PORT=5000 LOG_LEVEL=debug npm start
```

## 📊 Configuration Categories

### Server Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | 3000 | HTTP server port |
| `TCP_PORT` | number | 4000 | TCP server port |
| `UDP_PORT` | number | 5000 | UDP server port |
| `HOST` | string | '0.0.0.0' | Server host address |
| `BACKLOG` | number | 511 | Connection backlog |

### Performance Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MAX_CONNECTIONS` | number | 1000 | Maximum concurrent connections |
| `CONNECTION_TIMEOUT` | number | 30000 | Connection timeout (ms) |
| `KEEP_ALIVE` | boolean | true | Enable TCP keep-alive |
| `KEEP_ALIVE_INITIAL_DELAY` | number | 30000 | Keep-alive initial delay (ms) |

### Logging Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | string | 'info' | Log level (error, warn, info, debug) |
| `LOG_FORMAT` | string | 'json' | Log format (json, text) |
| `LOG_FILE` | string | - | Log file path |
| `LOG_MAX_SIZE` | string | '10m' | Max log file size |
| `LOG_MAX_FILES` | number | 5 | Max log files to keep |

### Metrics Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `METRICS_ENABLED` | boolean | true | Enable metrics collection |
| `METRICS_PORT` | number | 3001 | Metrics server port |
| `PROMETHEUS_ENABLED` | boolean | true | Enable Prometheus metrics |
| `PROMETHEUS_PORT` | number | 9090 | Prometheus server port |

### Plugin Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PLUGIN_DIR` | string | './plugins' | Plugin directory |
| `PLUGIN_AUTO_RELOAD` | boolean | false | Auto-reload plugins |
| `PLUGIN_TIMEOUT` | number | 5000 | Plugin timeout (ms) |
| `PLUGIN_ENABLED` | string | '*' | Comma-separated enabled plugins |

## 🔒 Security Configuration

### TLS/SSL Setup

```env
# Enable TLS
ENABLE_TLS=true
TLS_CERT_PATH=./certs/server.crt
TLS_KEY_PATH=./certs/server.key
TLS_CA_PATH=./certs/ca.crt
TLS_MIN_VERSION=TLSv1.2
TLS_CIPHERS=ECDHE-RSA-AES256-GCM-SHA384
```

### Authentication

```env
# Basic authentication
AUTH_ENABLED=true
AUTH_TYPE=basic
AUTH_USERNAME=admin
AUTH_PASSWORD=secure_password

# JWT authentication
AUTH_TYPE=jwt
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=24h
```

### Rate Limiting

```env
# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_SKIP_SUCCESSFUL=false
RATE_LIMIT_SKIP_FAILED=false
```

## 🏗️ Environment-Specific Configurations

### Development

```env
# Development configuration
NODE_ENV=development
LOG_LEVEL=debug
PLUGIN_AUTO_RELOAD=true
METRICS_ENABLED=false
ENABLE_HTTP_HEALTH=true
```

### Staging

```env
# Staging configuration
NODE_ENV=staging
LOG_LEVEL=info
PLUGIN_AUTO_RELOAD=false
METRICS_ENABLED=true
ENABLE_HTTP_HEALTH=true
RATE_LIMIT_ENABLED=true
```

### Production

```env
# Production configuration
NODE_ENV=production
LOG_LEVEL=warn
PLUGIN_AUTO_RELOAD=false
METRICS_ENABLED=true
ENABLE_HTTP_HEALTH=true
RATE_LIMIT_ENABLED=true
ENABLE_TLS=true
AUTH_ENABLED=true
```

## 🔍 Configuration Validation

### Schema Validation

```typescript
import { z } from 'zod';

const configSchema = z.object({
  tcp: z.object({
    port: z.number().min(1).max(65535),
    host: z.string().ip(),
    maxConnections: z.number().positive(),
    connectionTimeout: z.number().positive()
  }),
  udp: z.object({
    port: z.number().min(1).max(65535),
    host: z.string().ip(),
    maxPacketSize: z.number().positive()
  }),
  metrics: z.object({
    enabled: z.boolean(),
    port: z.number().min(1).max(65535)
  })
});

// Validate configuration
const validatedConfig = configSchema.parse(config);
```

### Environment Variable Validation

```bash
# Validate required environment variables
npm run validate:config

# Check configuration
npm run check:config
```

## 📝 Configuration Examples

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  tcp-udp-router:
    image: your-org/tcp-udp-router:latest
    ports:
      - "4000:4000"  # TCP
      - "5000:5000"  # UDP
      - "3001:3001"  # Metrics
      - "8080:8080"  # Health
    environment:
      - TCP_PORT=4000
      - UDP_PORT=5000
      - METRICS_PORT=3001
      - HTTP_HEALTH_PORT=8080
      - LOG_LEVEL=info
      - NODE_ENV=production
    volumes:
      - ./plugins:/app/plugins
      - ./logs:/app/logs
    restart: unless-stopped
```

### Kubernetes ConfigMap

```yaml
# k8s-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: tcp-udp-router-config
data:
  TCP_PORT: "4000"
  UDP_PORT: "5000"
  METRICS_PORT: "3001"
  HTTP_HEALTH_PORT: "8080"
  LOG_LEVEL: "info"
  NODE_ENV: "production"
  PLUGIN_DIR: "/app/plugins"
  METRICS_ENABLED: "true"
  ENABLE_HTTP_HEALTH: "true"
```

## 🔧 Configuration Management

### Configuration Reloading

```typescript
import { Router } from 'tcp-udp-router';

const router = new Router(config);

// Reload configuration
router.reloadConfig(newConfig);

// Hot reload on file changes
router.watchConfig('./config', (newConfig) => {
  router.reloadConfig(newConfig);
});
```

### Configuration Inheritance

```typescript
// Base configuration
const baseConfig = {
  logLevel: 'info',
  metricsEnabled: true,
  maxConnections: 1000
};

// Environment-specific overrides
const envConfig = {
  development: {
    logLevel: 'debug',
    pluginAutoReload: true
  },
  production: {
    logLevel: 'warn',
    enableTLS: true
  }
};

// Merge configurations
const finalConfig = mergeConfig(baseConfig, envConfig[process.env.NODE_ENV]);
```

## 📚 Additional Resources

- **[Environment Variables](./environment.md)** - Complete environment variable reference
- **[Plugin Configuration](./plugins.md)** - Plugin-specific configuration
- **[Security Configuration](./security.md)** - Security settings and best practices
- **[Performance Tuning](./performance.md)** - Performance optimization guide

---

<div align="center">

**Need help with configuration?** [Ask a Question](https://github.com/your-org/tcp-udp-router/discussions) • [View Examples](../examples/README.md)

</div>