# Troubleshooting Guide

Complete troubleshooting guide for the TCP/UDP Router.

## 📋 Table of Contents

- [Common Issues](./common.md) - Frequently encountered problems
- [Debugging](./debugging.md) - Debugging techniques and tools
- [Performance Issues](./performance.md) - Performance optimization
- [Network Issues](./network.md) - Network-related problems
- [Plugin Issues](./plugins.md) - Plugin troubleshooting
- [Monitoring Issues](./monitoring.md) - Monitoring and metrics problems

## 🚀 Quick Troubleshooting

### Health Check Commands

```bash
# Check if the router is running
curl http://localhost:8080/health

# Check metrics endpoint
curl http://localhost:3001/metrics

# Check if ports are listening
netstat -tulpn | grep -E ':(4000|5000|3001|8080)'

# Check process status
ps aux | grep tcp-udp-router
```

### Common Quick Fixes

```bash
# Restart the router
npm restart

# Clear logs
rm -rf logs/*

# Reset configuration
cp config/default.env .env

# Check disk space
df -h

# Check memory usage
free -h
```

## 🔍 Diagnostic Tools

### Built-in Diagnostics

```bash
# Run diagnostics
npm run diagnose

# Check configuration
npm run check:config

# Validate plugins
npm run validate:plugins

# Test connectivity
npm run test:connectivity
```

### System Diagnostics

```bash
# Check system resources
top -p $(pgrep -f tcp-udp-router)

# Check network connections
ss -tulpn | grep tcp-udp-router

# Check file descriptors
lsof -p $(pgrep -f tcp-udp-router)

# Check memory usage
cat /proc/$(pgrep -f tcp-udp-router)/status | grep -E "VmSize|VmRSS"
```

## 🐛 Common Issues

### 1. Port Already in Use

**Symptoms:**
- `EADDRINUSE` error
- Router fails to start
- "Address already in use" message

**Solutions:**

```bash
# Find process using the port
lsof -i :4000
lsof -i :5000

# Kill the process
kill -9 <PID>

# Or use a different port
TCP_PORT=4001 UDP_PORT=5001 npm start
```

**Prevention:**
```bash
# Check ports before starting
npm run check:ports

# Use dynamic port allocation
TCP_PORT=0 UDP_PORT=0 npm start
```

### 2. Permission Denied

**Symptoms:**
- `EACCES` error
- Cannot bind to privileged ports
- Permission denied messages

**Solutions:**

```bash
# Use non-privileged ports (>1024)
TCP_PORT=4000 UDP_PORT=5000 npm start

# Or run with sudo (not recommended for production)
sudo npm start

# Fix file permissions
chmod 755 dist/
chmod 644 .env
```

### 3. Memory Issues

**Symptoms:**
- High memory usage
- Out of memory errors
- Slow performance

**Solutions:**

```bash
# Check memory usage
node --max-old-space-size=2048 dist/index.js

# Enable garbage collection logging
node --trace-gc dist/index.js

# Monitor memory with Node.js inspector
node --inspect dist/index.js
```

**Configuration:**
```env
# Reduce memory usage
MAX_CONNECTIONS=500
CONNECTION_TIMEOUT=15000
PLUGIN_TIMEOUT=3000
```

### 4. Plugin Loading Issues

**Symptoms:**
- Plugin not found errors
- Plugin initialization failures
- Missing dependencies

**Solutions:**

```bash
# Check plugin directory
ls -la plugins/

# Validate plugin structure
npm run validate:plugins

# Check plugin dependencies
npm run check:dependencies

# Reinstall plugins
npm run reinstall:plugins
```

**Debug Plugin Loading:**
```typescript
// Enable plugin debugging
DEBUG=plugin:* npm start

// Check plugin logs
tail -f logs/plugin.log
```

### 5. Network Connectivity Issues

**Symptoms:**
- Cannot connect to router
- Connection timeouts
- Network unreachable errors

**Solutions:**

```bash
# Check firewall rules
sudo ufw status
sudo iptables -L

# Test network connectivity
telnet localhost 4000
nc -v localhost 5000

# Check DNS resolution
nslookup your-domain.com

# Test with different client
curl -v telnet://localhost:4000
```

### 6. Performance Issues

**Symptoms:**
- Slow response times
- High CPU usage
- Connection drops

**Solutions:**

```bash
# Profile the application
node --prof dist/index.js

# Analyze CPU usage
node --prof-process isolate-*.log > profile.txt

# Check for memory leaks
node --inspect --expose-gc dist/index.js
```

**Performance Tuning:**
```env
# Optimize performance
MAX_CONNECTIONS=2000
CONNECTION_TIMEOUT=30000
KEEP_ALIVE=true
KEEP_ALIVE_INITIAL_DELAY=30000
```

## 🔧 Debugging Techniques

### 1. Log Analysis

```bash
# View real-time logs
tail -f logs/router.log

# Search for errors
grep -i error logs/router.log

# Search for specific patterns
grep "connection" logs/router.log | tail -20

# Analyze log patterns
awk '/ERROR/ {print $1, $2}' logs/router.log | sort | uniq -c
```

### 2. Network Debugging

```bash
# Capture network traffic
tcpdump -i any -w capture.pcap port 4000 or port 5000

# Analyze with Wireshark
wireshark capture.pcap

# Monitor connections
watch -n 1 'netstat -an | grep :4000 | wc -l'

# Check routing
traceroute your-target.com
```

### 3. Process Debugging

```bash
# Attach debugger
node --inspect-brk=0.0.0.0:9229 dist/index.js

# Use Chrome DevTools
chrome://inspect

# Debug with VS Code
# Add to launch.json:
{
  "type": "node",
  "request": "attach",
  "name": "Attach to TCP/UDP Router",
  "port": 9229
}
```

### 4. Memory Debugging

```bash
# Generate heap dump
node --heapsnapshot-signal=SIGUSR2 dist/index.js

# Analyze heap dump
node --inspect dist/index.js

# Monitor memory usage
watch -n 1 'ps -o pid,ppid,cmd,%mem,%cpu --sort=-%mem | head -10'
```

## 📊 Performance Troubleshooting

### 1. High CPU Usage

**Diagnosis:**
```bash
# Check CPU usage
top -p $(pgrep -f tcp-udp-router)

# Profile CPU
node --prof dist/index.js

# Check for hot functions
node --prof-process isolate-*.log
```

**Solutions:**
```typescript
// Optimize hot paths
const optimizedHandler = (data: Buffer) => {
  // Use Buffer operations instead of string operations
  return data;
};

// Use worker threads for heavy processing
import { Worker } from 'worker_threads';
```

### 2. Memory Leaks

**Diagnosis:**
```bash
# Monitor memory usage
watch -n 1 'ps -o pid,vsz,rss,comm -p $(pgrep -f tcp-udp-router)'

# Generate heap snapshots
node --inspect dist/index.js
```

**Solutions:**
```typescript
// Proper cleanup
class ConnectionManager {
  private connections = new Map();

  cleanup() {
    for (const [id, connection] of this.connections) {
      if (connection.isDestroyed()) {
        this.connections.delete(id);
      }
    }
  }
}

// Use WeakMap for automatic cleanup
const connectionData = new WeakMap();
```

### 3. Slow Response Times

**Diagnosis:**
```bash
# Measure response times
time curl http://localhost:8080/health

# Profile network latency
ping localhost

# Check for bottlenecks
strace -p $(pgrep -f tcp-udp-router)
```

**Solutions:**
```typescript
// Optimize data processing
const processData = (data: Buffer) => {
  // Use streaming for large data
  return data;
};

// Implement caching
const cache = new Map();
const getCachedData = (key: string) => {
  if (cache.has(key)) {
    return cache.get(key);
  }
  // ... fetch data
};
```

## 🔌 Plugin Troubleshooting

### 1. Plugin Loading Errors

**Common Issues:**
- Missing dependencies
- Syntax errors
- Incorrect plugin structure

**Debugging:**
```bash
# Check plugin syntax
node -c plugins/my-plugin.js

# Validate plugin structure
npm run validate:plugin plugins/my-plugin.js

# Check plugin dependencies
npm ls --prefix plugins/my-plugin
```

**Solutions:**
```typescript
// Proper plugin structure
export class MyPlugin implements Plugin {
  name = 'my-plugin';
  version = '1.0.0';

  onLoad(config: PluginConfig) {
    // Validate configuration
    if (!config.requiredOption) {
      throw new Error('Missing required option');
    }
  }

  onData(data: Buffer, socket: Socket): Buffer {
    try {
      // Process data
      return data;
    } catch (error) {
      console.error('Plugin error:', error);
      return data; // Return original data on error
    }
  }
}
```

### 2. Plugin Performance Issues

**Diagnosis:**
```typescript
// Add performance monitoring
class PerformancePlugin implements Plugin {
  private metrics = new Map();

  onData(data: Buffer, socket: Socket): Buffer {
    const start = process.hrtime.bigint();
    
    // Process data
    const result = this.processData(data);
    
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    this.recordMetric(socket.remoteAddress, duration);
    
    return result;
  }

  private recordMetric(clientId: string, duration: number) {
    const clientMetrics = this.metrics.get(clientId) || [];
    clientMetrics.push(duration);
    this.metrics.set(clientId, clientMetrics.slice(-100)); // Keep last 100
  }
}
```

## 📈 Monitoring Troubleshooting

### 1. Metrics Not Available

**Symptoms:**
- Metrics endpoint returns 404
- Prometheus cannot scrape metrics
- Grafana shows no data

**Solutions:**
```bash
# Check metrics server
curl http://localhost:3001/metrics

# Verify Prometheus configuration
cat prometheus.yml

# Check firewall rules
sudo ufw allow 3001
```

### 2. Health Check Failures

**Symptoms:**
- Health endpoint returns unhealthy
- Kubernetes liveness probe fails
- Load balancer marks instance as unhealthy

**Debugging:**
```bash
# Check health endpoint
curl -v http://localhost:8080/health

# Check detailed health
curl http://localhost:8080/health/detailed

# Check individual health checks
curl http://localhost:8080/health/tcp
curl http://localhost:8080/health/udp
```

### 3. Log Aggregation Issues

**Symptoms:**
- Logs not appearing in centralized system
- Missing log entries
- Log format issues

**Solutions:**
```bash
# Check log configuration
cat .env | grep LOG

# Test log output
npm start 2>&1 | tee test.log

# Verify log format
tail -1 logs/router.log | jq .
```

## 🛠️ Advanced Troubleshooting

### 1. Core Dumps

```bash
# Enable core dumps
ulimit -c unlimited
echo '/tmp/core.%e.%p' | sudo tee /proc/sys/kernel/core_pattern

# Analyze core dump
gdb node /tmp/core.node.12345

# Use lldb on macOS
lldb node /tmp/core.node.12345
```

### 2. System Call Tracing

```bash
# Trace system calls
strace -f -p $(pgrep -f tcp-udp-router)

# Trace network calls
strace -e trace=network -p $(pgrep -f tcp-udp-router)

# Trace file operations
strace -e trace=file -p $(pgrep -f tcp-udp-router)
```

### 3. Performance Profiling

```bash
# CPU profiling
node --prof dist/index.js
node --prof-process isolate-*.log > profile.txt

# Memory profiling
node --inspect --expose-gc dist/index.js

# Flame graph generation
npm install -g 0x
0x dist/index.js
```

## 📚 Additional Resources

- **[Common Issues](./common.md)** - Detailed common problems
- **[Debugging Guide](./debugging.md)** - Advanced debugging techniques
- **[Performance Guide](./performance.md)** - Performance optimization
- **[Network Guide](./network.md)** - Network troubleshooting
- **[Plugin Troubleshooting](./plugins.md)** - Plugin-specific issues
- **[Monitoring Issues](./monitoring.md)** - Monitoring problems

---

<div align="center">

**Need help troubleshooting?** [Ask a Question](https://github.com/your-org/tcp-udp-router/discussions) • [Report an Issue](https://github.com/your-org/tcp-udp-router/issues)

</div>