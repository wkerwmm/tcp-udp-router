# Quick Start Guide

Get the TCP/UDP Router up and running in under 5 minutes! 🚀

## Prerequisites

- **Node.js** 16.x or higher
- **npm** 7.x or higher (or **yarn** 1.22+)
- **Git** (for cloning the repository)

## Installation Options

### Option 1: Clone and Install (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/tcp-udp-router.git
cd tcp-udp-router

# Install dependencies
npm install

# Build the project
npm run build
```

### Option 2: Using Docker

```bash
# Pull the official image
docker pull your-org/tcp-udp-router:latest

# Or build from source
docker build -t tcp-udp-router .
```

### Option 3: Using npm (if published)

```bash
# Install globally
npm install -g tcp-udp-router

# Or install locally
npm install tcp-udp-router
```

## Basic Configuration

Create a `.env` file in your project root:

```env
# Server Configuration
PORT=3000
TCP_PORT=4000
UDP_PORT=5000

# Logging
LOG_LEVEL=info

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

## Running the Router

### Development Mode

```bash
# Start in development mode with hot reload
npm run dev
```

### Production Mode

```bash
# Build the project
npm run build

# Start the production server
npm start
```

### Using Docker

```bash
# Run with default configuration
docker run -p 3000:3000 -p 4000:4000 -p 5000:5000 tcp-udp-router

# Run with custom environment
docker run -p 3000:3000 -p 4000:4000 -p 5000:5000 \
  -e TCP_PORT=4000 \
  -e UDP_PORT=5000 \
  -e LOG_LEVEL=debug \
  tcp-udp-router
```

## Verify Installation

### 1. Check Health Endpoint

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 123.456
}
```

### 2. Check Metrics Endpoint

```bash
curl http://localhost:3001/metrics
```

Expected response:
```
# HELP tcp_connections_total Total number of TCP connections
# TYPE tcp_connections_total counter
tcp_connections_total 0

# HELP udp_packets_total Total number of UDP packets
# TYPE udp_packets_total counter
udp_packets_total 0
```

### 3. Test TCP Connection

```bash
# Using netcat
echo "Hello TCP Router!" | nc localhost 4000

# Using telnet
telnet localhost 4000
```

### 4. Test UDP Connection

```bash
# Using netcat
echo "Hello UDP Router!" | nc -u localhost 5000
```

## Basic Usage Examples

### Simple TCP Echo Server

```typescript
import { TCPRouter } from 'tcp-udp-router';

const router = new TCPRouter({
  port: 4000,
  plugins: ['echo']
});

router.start();
```

### UDP Packet Logger

```typescript
import { UDPRouter } from 'tcp-udp-router';

const router = new UDPRouter({
  port: 5000,
  plugins: ['logger']
});

router.start();
```

### Custom Middleware

```typescript
import { TCPRouter } from 'tcp-udp-router';

const router = new TCPRouter({
  port: 4000,
  middleware: [
    (data, next) => {
      console.log('Received:', data);
      next(data);
    }
  ]
});

router.start();
```

## Next Steps

Now that you have the router running, explore these topics:

- **[Configuration Guide](../configuration/README.md)** - Learn about all configuration options
- **[Plugin Development](../plugins/development.md)** - Create custom plugins
- **[API Reference](../api/README.md)** - Complete API documentation
- **[Monitoring Setup](../monitoring/README.md)** - Set up metrics and alerts

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Check what's using the port
lsof -i :4000

# Kill the process
kill -9 <PID>
```

**Permission denied:**
```bash
# On Linux/macOS, you might need sudo for privileged ports
sudo npm start

# Or use non-privileged ports (>1024)
TCP_PORT=4000 UDP_PORT=5000 npm start
```

**Docker connection issues:**
```bash
# Check if container is running
docker ps

# Check container logs
docker logs <container-id>
```

### Getting Help

- 📖 [Documentation](../README.md) - Complete documentation
- 🐛 [Issue Tracker](https://github.com/your-org/tcp-udp-router/issues) - Report bugs
- 💬 [Discussions](https://github.com/your-org/tcp-udp-router/discussions) - Ask questions
- 📧 [Email Support](mailto:support@your-org.com) - Direct support

---

<div align="center">

**🎉 Congratulations! You've successfully set up the TCP/UDP Router!**

[Continue to Configuration →](../configuration/README.md)

</div>