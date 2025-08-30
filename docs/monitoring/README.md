# Monitoring & Observability

Complete monitoring and observability guide for the TCP/UDP Router.

## 📋 Table of Contents

- [Metrics](./metrics.md) - Prometheus metrics and dashboards
- [Health Checks](./health.md) - Health check endpoints
- [Logging](./logging.md) - Logging configuration and levels
- [Alerting](./alerting.md) - Alert rules and notifications
- [Tracing](./tracing.md) - Distributed tracing setup
- [Dashboards](./dashboards.md) - Grafana dashboard templates

## 🚀 Quick Start

### Enable Monitoring

```env
# Basic monitoring setup
METRICS_ENABLED=true
METRICS_PORT=3001
ENABLE_HTTP_HEALTH=true
HTTP_HEALTH_PORT=8080
LOG_LEVEL=info
LOG_FORMAT=json
```

### Check Health

```bash
# Health check
curl http://localhost:8080/health

# Metrics endpoint
curl http://localhost:3001/metrics

# Ready check
curl http://localhost:8080/ready
```

## 📊 Metrics Overview

### Available Metrics

| Metric Name | Type | Description |
|-------------|------|-------------|
| `tcp_connections_total` | Counter | Total TCP connections |
| `tcp_connections_active` | Gauge | Active TCP connections |
| `tcp_data_transferred_bytes` | Counter | Total data transferred via TCP |
| `udp_packets_total` | Counter | Total UDP packets received |
| `udp_data_transferred_bytes` | Counter | Total data transferred via UDP |
| `router_uptime_seconds` | Gauge | Router uptime in seconds |
| `router_memory_usage_bytes` | Gauge | Memory usage in bytes |
| `router_cpu_usage_percent` | Gauge | CPU usage percentage |
| `plugin_execution_duration_seconds` | Histogram | Plugin execution time |
| `middleware_execution_duration_seconds` | Histogram | Middleware execution time |

### Custom Metrics

```typescript
import { Metrics } from 'tcp-udp-router';

// Create custom metrics
const customCounter = Metrics.counter('custom_events_total', 'Custom events counter');
const customGauge = Metrics.gauge('custom_value', 'Custom gauge value');
const customHistogram = Metrics.histogram('custom_duration_seconds', 'Custom duration');

// Use metrics
customCounter.inc();
customGauge.set(42);
customHistogram.observe(1.5);
```

## 🏥 Health Checks

### Built-in Health Checks

```bash
# Basic health check
curl http://localhost:8080/health

# Detailed health check
curl http://localhost:8080/health/detailed

# Readiness check
curl http://localhost:8080/ready

# Liveness check
curl http://localhost:8080/live
```

### Health Check Responses

**Basic Health:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 123.456
}
```

**Detailed Health:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 123.456,
  "checks": {
    "tcp_server": {
      "status": "healthy",
      "message": "TCP server is running on port 4000"
    },
    "udp_server": {
      "status": "healthy",
      "message": "UDP server is running on port 5000"
    },
    "metrics_server": {
      "status": "healthy",
      "message": "Metrics server is running on port 3001"
    },
    "memory_usage": {
      "status": "healthy",
      "message": "Memory usage: 45.2 MB",
      "value": 45.2
    },
    "cpu_usage": {
      "status": "healthy",
      "message": "CPU usage: 2.1%",
      "value": 2.1
    }
  }
}
```

### Custom Health Checks

```typescript
import { HealthCheck } from 'tcp-udp-router';

// Register custom health check
HealthCheck.register('database', async () => {
  try {
    await database.ping();
    return { status: 'healthy', message: 'Database connection OK' };
  } catch (error) {
    return { status: 'unhealthy', message: 'Database connection failed' };
  }
});

// Register health check with timeout
HealthCheck.register('external_service', async () => {
  const response = await fetch('https://api.example.com/health');
  return { status: response.ok ? 'healthy' : 'unhealthy' };
}, { timeout: 5000 });
```

## 📝 Logging

### Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `error` | Error conditions | Application errors, exceptions |
| `warn` | Warning conditions | Deprecated features, performance issues |
| `info` | General information | Application startup, configuration |
| `debug` | Debug information | Detailed debugging information |
| `trace` | Trace information | Very detailed debugging |

### Log Configuration

```env
# Logging configuration
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=./logs/router.log
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5
LOG_TIMESTAMP=true
LOG_COLORS=false
```

### Structured Logging

```typescript
import { Logger } from 'tcp-udp-router';

// Structured logging
Logger.info('Connection established', {
  client_ip: '192.168.1.100',
  port: 4000,
  protocol: 'tcp',
  user_agent: 'netcat/1.0'
});

Logger.error('Plugin execution failed', {
  plugin: 'logger',
  error: error.message,
  stack: error.stack,
  context: { data_size: data.length }
});
```

### Log Formats

**JSON Format:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "TCP server started",
  "port": 4000,
  "host": "0.0.0.0",
  "pid": 12345
}
```

**Text Format:**
```
2024-01-15T10:30:00.000Z [INFO] TCP server started on 0.0.0.0:4000
```

## 🚨 Alerting

### Prometheus Alert Rules

```yaml
# prometheus-alerts.yml
groups:
  - name: tcp-udp-router
    rules:
      - alert: HighConnectionCount
        expr: tcp_connections_active > 800
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High TCP connection count"
          description: "TCP connections are above 800 for 5 minutes"

      - alert: RouterDown
        expr: up{job="tcp-udp-router"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "TCP/UDP Router is down"
          description: "Router has been down for more than 1 minute"

      - alert: HighMemoryUsage
        expr: router_memory_usage_bytes / 1024 / 1024 > 512
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Router memory usage is above 512MB"

      - alert: HighCPUUsage
        expr: router_cpu_usage_percent > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
          description: "Router CPU usage is above 80%"
```

### Grafana Alerts

```json
{
  "alert": {
    "name": "High Connection Count",
    "message": "TCP connections are above threshold",
    "executionErrorState": "alerting",
    "for": "5m",
    "frequency": "1m",
    "handler": 1,
    "noDataState": "no_data",
    "notifications": []
  },
  "conditions": [
    {
      "type": "query",
      "query": {
        "params": ["A", "5m", "now"]
      },
      "reducer": {
        "params": [],
        "type": "avg"
      },
      "evaluator": {
        "params": [800],
        "type": "gt"
      }
    }
  ]
}
```

## 📈 Dashboards

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "TCP/UDP Router Dashboard",
    "panels": [
      {
        "title": "Active Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "tcp_connections_active",
            "legendFormat": "TCP Connections"
          },
          {
            "expr": "udp_packets_total",
            "legendFormat": "UDP Packets"
          }
        ]
      },
      {
        "title": "Data Transfer",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(tcp_data_transferred_bytes[5m])",
            "legendFormat": "TCP Data Rate"
          },
          {
            "expr": "rate(udp_data_transferred_bytes[5m])",
            "legendFormat": "UDP Data Rate"
          }
        ]
      },
      {
        "title": "System Resources",
        "type": "graph",
        "targets": [
          {
            "expr": "router_memory_usage_bytes / 1024 / 1024",
            "legendFormat": "Memory Usage (MB)"
          },
          {
            "expr": "router_cpu_usage_percent",
            "legendFormat": "CPU Usage (%)"
          }
        ]
      }
    ]
  }
}
```

### Custom Dashboards

```typescript
import { Dashboard } from 'tcp-udp-router';

// Create custom dashboard
const dashboard = new Dashboard('Custom Router Dashboard');

// Add panels
dashboard.addPanel('Connection Overview', {
  type: 'graph',
  metrics: ['tcp_connections_active', 'udp_packets_total'],
  refresh: '5s'
});

dashboard.addPanel('Performance Metrics', {
  type: 'graph',
  metrics: ['plugin_execution_duration_seconds', 'middleware_execution_duration_seconds'],
  refresh: '10s'
});

// Export dashboard
dashboard.export('./dashboards/custom-dashboard.json');
```

## 🔍 Distributed Tracing

### OpenTelemetry Setup

```typescript
import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

// Setup tracing
const provider = new NodeTracerProvider();
const exporter = new JaegerExporter({
  endpoint: 'http://localhost:14268/api/traces'
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
trace.setGlobalTracerProvider(provider);

// Create spans
const tracer = trace.getTracer('tcp-udp-router');

tracer.startActiveSpan('process_tcp_data', (span) => {
  span.setAttribute('data.size', data.length);
  span.setAttribute('client.ip', socket.remoteAddress);
  
  // Process data...
  
  span.end();
});
```

## 📊 Monitoring Stack

### Recommended Stack

1. **Prometheus** - Metrics collection and storage
2. **Grafana** - Visualization and dashboards
3. **AlertManager** - Alert routing and notification
4. **Jaeger** - Distributed tracing
5. **ELK Stack** - Log aggregation and analysis

### Docker Compose Setup

```yaml
# monitoring-stack.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "14268:14268"

volumes:
  prometheus_data:
  grafana_data:
```

## 🔧 Monitoring Configuration

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'tcp-udp-router'
    static_configs:
      - targets: ['localhost:3001']
    scrape_interval: 5s
    metrics_path: '/metrics'

  - job_name: 'tcp-udp-router-health'
    static_configs:
      - targets: ['localhost:8080']
    scrape_interval: 30s
    metrics_path: '/health'
```

### AlertManager Configuration

```yaml
# alertmanager.yml
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alertmanager@example.com'

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'

receivers:
  - name: 'web.hook'
    webhook_configs:
      - url: 'http://127.0.0.1:5001/'
```

## 📚 Additional Resources

- **[Metrics Reference](./metrics.md)** - Complete metrics documentation
- **[Health Check API](./health.md)** - Health check endpoints
- **[Logging Guide](./logging.md)** - Logging configuration
- **[Alerting Rules](./alerting.md)** - Alert configuration
- **[Dashboard Templates](./dashboards.md)** - Pre-built dashboards

---

<div align="center">

**Need help with monitoring?** [Ask a Question](https://github.com/your-org/tcp-udp-router/discussions) • [View Examples](../examples/monitoring.md)

</div>