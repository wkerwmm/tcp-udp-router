# Deployment Guide

Complete deployment guide for the TCP/UDP Router in various environments.

## 📋 Table of Contents

- [Docker](./docker.md) - Containerized deployment
- [Kubernetes](./kubernetes.md) - K8s deployment guides
- [Production](./production.md) - Production deployment checklist
- [CI/CD](./ci-cd.md) - Continuous integration and deployment
- [Scaling](./scaling.md) - Horizontal and vertical scaling
- [Security](./security.md) - Security hardening

## 🚀 Quick Deployment

### Docker Quick Start

```bash
# Pull the image
docker pull your-org/tcp-udp-router:latest

# Run with default configuration
docker run -p 4000:4000 -p 5000:5000 -p 3001:3001 your-org/tcp-udp-router:latest

# Run with custom configuration
docker run -p 4000:4000 -p 5000:5000 -p 3001:3001 \
  -e TCP_PORT=4000 \
  -e UDP_PORT=5000 \
  -e METRICS_PORT=3001 \
  -e LOG_LEVEL=info \
  your-org/tcp-udp-router:latest
```

### Kubernetes Quick Start

```bash
# Apply the deployment
kubectl apply -f k8s/deployment.yaml

# Check the deployment
kubectl get pods -l app=tcp-udp-router

# Access the service
kubectl port-forward svc/tcp-udp-router 4000:4000
```

## 🐳 Docker Deployment

### Dockerfile

```dockerfile
# Multi-stage build for production
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs /app/plugins && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000 4000 5000 3001 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  tcp-udp-router:
    image: your-org/tcp-udp-router:latest
    container_name: tcp-udp-router
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
      - ./config:/app/config:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - router-network

  # Monitoring stack
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'
    restart: unless-stopped
    networks:
      - router-network

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources
    restart: unless-stopped
    networks:
      - router-network

volumes:
  prometheus_data:
  grafana_data:

networks:
  router-network:
    driver: bridge
```

### Production Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  tcp-udp-router:
    image: your-org/tcp-udp-router:latest
    container_name: tcp-udp-router-prod
    ports:
      - "4000:4000"
      - "5000:5000"
      - "3001:3001"
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - TCP_PORT=4000
      - UDP_PORT=5000
      - METRICS_PORT=3001
      - HTTP_HEALTH_PORT=8080
      - LOG_LEVEL=warn
      - METRICS_ENABLED=true
      - ENABLE_HTTP_HEALTH=true
      - RATE_LIMIT_ENABLED=true
      - RATE_LIMIT_WINDOW=60000
      - RATE_LIMIT_MAX_REQUESTS=100
      - ENABLE_TLS=true
      - TLS_CERT_PATH=/app/certs/server.crt
      - TLS_KEY_PATH=/app/certs/server.key
    volumes:
      - ./plugins:/app/plugins:ro
      - ./logs:/app/logs
      - ./config:/app/config:ro
      - ./certs:/app/certs:ro
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
    networks:
      - router-network

  # Load balancer
  nginx:
    image: nginx:alpine
    container_name: nginx-lb
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    restart: unless-stopped
    depends_on:
      - tcp-udp-router
    networks:
      - router-network

volumes:
  router-logs:

networks:
  router-network:
    driver: bridge
```

## ☸️ Kubernetes Deployment

### Basic Deployment

```yaml
# k8s/deployment.yaml
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

### Service Configuration

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: tcp-udp-router
  labels:
    app: tcp-udp-router
spec:
  type: LoadBalancer
  ports:
  - port: 4000
    targetPort: 4000
    protocol: TCP
    name: tcp
  - port: 5000
    targetPort: 5000
    protocol: UDP
    name: udp
  - port: 3001
    targetPort: 3001
    protocol: TCP
    name: metrics
  - port: 8080
    targetPort: 8080
    protocol: TCP
    name: health
  selector:
    app: tcp-udp-router
```

### ConfigMap

```yaml
# k8s/configmap.yaml
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
  RATE_LIMIT_ENABLED: "true"
  RATE_LIMIT_WINDOW: "60000"
  RATE_LIMIT_MAX_REQUESTS: "100"
```

### Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: tcp-udp-router-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: tcp-udp-router
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Ingress Configuration

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tcp-udp-router-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - router.yourdomain.com
    secretName: tcp-udp-router-tls
  rules:
  - host: router.yourdomain.com
    http:
      paths:
      - path: /health
        pathType: Prefix
        backend:
          service:
            name: tcp-udp-router
            port:
              number: 8080
      - path: /metrics
        pathType: Prefix
        backend:
          service:
            name: tcp-udp-router
            port:
              number: 3001
```

## 🏭 Production Deployment

### Production Checklist

- [ ] **Security**
  - [ ] TLS/SSL certificates configured
  - [ ] Firewall rules configured
  - [ ] Network security groups set up
  - [ ] Authentication enabled
  - [ ] Rate limiting configured

- [ ] **Monitoring**
  - [ ] Prometheus metrics enabled
  - [ ] Grafana dashboards configured
  - [ ] Alerting rules set up
  - [ ] Log aggregation configured
  - [ ] Health checks implemented

- [ ] **Performance**
  - [ ] Resource limits configured
  - [ ] Auto-scaling enabled
  - [ ] Load balancing configured
  - [ ] Connection pooling optimized
  - [ ] Memory usage optimized

- [ ] **Reliability**
  - [ ] High availability setup
  - [ ] Backup strategy implemented
  - [ ] Disaster recovery plan
  - [ ] Rolling update strategy
  - [ ] Graceful shutdown handling

### Production Environment Variables

```env
# Production configuration
NODE_ENV=production
TCP_PORT=4000
UDP_PORT=5000
METRICS_PORT=3001
HTTP_HEALTH_PORT=8080

# Security
ENABLE_TLS=true
TLS_CERT_PATH=/app/certs/server.crt
TLS_KEY_PATH=/app/certs/server.key
AUTH_ENABLED=true
AUTH_TYPE=jwt
JWT_SECRET=your-super-secret-jwt-key

# Performance
MAX_CONNECTIONS=10000
CONNECTION_TIMEOUT=30000
KEEP_ALIVE=true
KEEP_ALIVE_INITIAL_DELAY=30000

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=1000

# Logging
LOG_LEVEL=warn
LOG_FORMAT=json
LOG_FILE=/app/logs/router.log
LOG_MAX_SIZE=100m
LOG_MAX_FILES=10

# Monitoring
METRICS_ENABLED=true
PROMETHEUS_ENABLED=true
ENABLE_HTTP_HEALTH=true
HEALTH_CHECK_INTERVAL=30000

# Plugins
PLUGIN_DIR=/app/plugins
PLUGIN_AUTO_RELOAD=false
PLUGIN_TIMEOUT=5000
```

## 🔄 CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy TCP/UDP Router

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Run linting
      run: npm run lint
    
    - name: Build application
      run: npm run build

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Login to Docker Hub
      uses: docker/login-action@v2
      with:
        username: ${{ secrets.DOCKER_USERNAME }}
        password: ${{ secrets.DOCKER_PASSWORD }}
    
    - name: Build and push Docker image
      uses: docker/build-push-action@v4
      with:
        context: .
        push: true
        tags: |
          your-org/tcp-udp-router:latest
          your-org/tcp-udp-router:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup kubectl
      uses: azure/setup-kubectl@v3
      with:
        version: 'latest'
    
    - name: Configure kubectl
      run: |
        echo "${{ secrets.KUBE_CONFIG }}" | base64 -d > kubeconfig
        export KUBECONFIG=kubeconfig
    
    - name: Deploy to Kubernetes
      run: |
        kubectl apply -f k8s/
        kubectl rollout status deployment/tcp-udp-router
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - test
  - build
  - deploy

variables:
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: "/certs"

test:
  stage: test
  image: node:18-alpine
  script:
    - npm ci
    - npm test
    - npm run lint
    - npm run build
  only:
    - main
    - merge_requests

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - docker tag $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA $CI_REGISTRY_IMAGE:latest
    - docker push $CI_REGISTRY_IMAGE:latest
  only:
    - main

deploy:production:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache curl
    - curl -LO https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl
    - chmod +x ./kubectl
    - mv ./kubectl /usr/local/bin/kubectl
  script:
    - kubectl config set-cluster k8s --server="$KUBE_URL" --insecure-skip-tls-verify=true
    - kubectl config set-credentials admin --token="$KUBE_TOKEN"
    - kubectl config set-context default --cluster=k8s --user=admin
    - kubectl config use-context default
    - kubectl set image deployment/tcp-udp-router tcp-udp-router=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - kubectl rollout status deployment/tcp-udp-router
  environment:
    name: production
    url: https://router.yourdomain.com
  only:
    - main
```

## 📈 Scaling Strategies

### Horizontal Scaling

```yaml
# k8s/scaling.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: tcp-udp-router-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: tcp-udp-router
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Object
    object:
      metric:
        name: tcp_connections_active
      describedObject:
        apiVersion: v1
        kind: Service
        name: tcp-udp-router
      target:
        type: AverageValue
        averageValue: 1000
```

### Vertical Scaling

```yaml
# k8s/vertical-pod-autoscaler.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: tcp-udp-router-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: tcp-udp-router
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: '*'
      minAllowed:
        cpu: 100m
        memory: 50Mi
      maxAllowed:
        cpu: 1
        memory: 500Mi
      controlledValues: RequestsAndLimits
```

## 🔒 Security Hardening

### Security Context

```yaml
# k8s/security-context.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tcp-udp-router
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
        capabilities:
          drop:
            - ALL
      containers:
      - name: tcp-udp-router
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1000
          capabilities:
            drop:
              - ALL
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: varlog
          mountPath: /var/log
      volumes:
      - name: tmp
        emptyDir: {}
      - name: varlog
        emptyDir: {}
```

### Network Policies

```yaml
# k8s/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: tcp-udp-router-network-policy
spec:
  podSelector:
    matchLabels:
      app: tcp-udp-router
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 4000
    - protocol: UDP
      port: 5000
    - protocol: TCP
      port: 3001
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: monitoring
    ports:
    - protocol: TCP
      port: 9090
  - to: []
    ports:
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
```

## 📚 Additional Resources

- **[Docker Guide](./docker.md)** - Detailed Docker deployment
- **[Kubernetes Guide](./kubernetes.md)** - Complete K8s setup
- **[Production Checklist](./production.md)** - Production readiness
- **[CI/CD Pipeline](./ci-cd.md)** - Automated deployment
- **[Scaling Guide](./scaling.md)** - Performance optimization
- **[Security Guide](./security.md)** - Security best practices

---

<div align="center">

**Need help with deployment?** [Ask a Question](https://github.com/your-org/tcp-udp-router/discussions) • [View Examples](../examples/deployment.md)

</div>