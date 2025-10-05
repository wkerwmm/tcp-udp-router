interface Config {
  PORT: string
  TCP_PORT: string
  UDP_PORT: string
  LOG_LEVEL: string
  METRICS_ENABLED: boolean
  METRICS_PORT: string
  PLUGIN_DIR: string
  MAX_CONNECTIONS: number
  CONNECTION_TIMEOUT: number
  HEALTH_CHECK_INTERVAL: number
  ENABLE_HTTP_HEALTH: boolean
  HTTP_HEALTH_PORT: string
  MINECRAFT_TARGET_IP: string
  MINECRAFT_TARGET_PORT: string
  // Security configuration
  ENABLE_IP_FILTERING: boolean
  ENABLE_RATE_LIMITING: boolean
  ENABLE_HEALTH_CHECK_AUTH: boolean
  HEALTH_CHECK_SECRET?: string
  MAX_CONNECTIONS_PER_IP: number
  RATE_LIMIT_WINDOW_MS: number
  RATE_LIMIT_MAX_REQUESTS: number
  ENABLE_DETAILED_HEALTH: boolean
}

export function loadConfig(): Config {
  const rawConfig = {
    PORT: process.env.PORT,
    TCP_PORT: process.env.TCP_PORT,
    UDP_PORT: process.env.UDP_PORT,
    LOG_LEVEL: process.env.LOG_LEVEL,
    METRICS_ENABLED: process.env.METRICS_ENABLED,
    METRICS_PORT: process.env.METRICS_PORT,
    PLUGIN_DIR: process.env.PLUGIN_DIR,
    MAX_CONNECTIONS: process.env.MAX_CONNECTIONS,
    CONNECTION_TIMEOUT: process.env.CONNECTION_TIMEOUT,
    HEALTH_CHECK_INTERVAL: process.env.HEALTH_CHECK_INTERVAL,
    ENABLE_HTTP_HEALTH: process.env.ENABLE_HTTP_HEALTH,
    HTTP_HEALTH_PORT: process.env.HTTP_HEALTH_PORT,
    MINECRAFT_TARGET_IP: process.env.MINECRAFT_TARGET_IP,
    MINECRAFT_TARGET_PORT: process.env.MINECRAFT_TARGET_PORT,
    // Security configuration
    ENABLE_IP_FILTERING: process.env.ENABLE_IP_FILTERING,
    ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING,
    ENABLE_HEALTH_CHECK_AUTH: process.env.ENABLE_HEALTH_CHECK_AUTH,
    HEALTH_CHECK_SECRET: process.env.HEALTH_CHECK_SECRET,
    MAX_CONNECTIONS_PER_IP: process.env.MAX_CONNECTIONS_PER_IP,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
    ENABLE_DETAILED_HEALTH: process.env.ENABLE_DETAILED_HEALTH
  }

  const config: Config = {
    PORT: rawConfig.PORT || '3000',
    TCP_PORT: rawConfig.TCP_PORT || '4000',
    UDP_PORT: rawConfig.UDP_PORT || '5000',
    LOG_LEVEL: rawConfig.LOG_LEVEL || 'info',
    METRICS_ENABLED: rawConfig.METRICS_ENABLED === 'true',
    METRICS_PORT: rawConfig.METRICS_PORT || '3001',
    PLUGIN_DIR: rawConfig.PLUGIN_DIR || './plugins',
    MAX_CONNECTIONS: parseInt(rawConfig.MAX_CONNECTIONS || '1000', 10),
    CONNECTION_TIMEOUT: parseInt(rawConfig.CONNECTION_TIMEOUT || '30000', 10),
    HEALTH_CHECK_INTERVAL: parseInt(rawConfig.HEALTH_CHECK_INTERVAL || '30000', 10),
    ENABLE_HTTP_HEALTH: rawConfig.ENABLE_HTTP_HEALTH !== 'false',
    HTTP_HEALTH_PORT: rawConfig.HTTP_HEALTH_PORT || '8080',
    MINECRAFT_TARGET_IP: rawConfig.MINECRAFT_TARGET_IP || '127.0.0.1',
    MINECRAFT_TARGET_PORT: rawConfig.MINECRAFT_TARGET_PORT || '25566',
    // Security configuration defaults
    ENABLE_IP_FILTERING: rawConfig.ENABLE_IP_FILTERING === 'true',
    ENABLE_RATE_LIMITING: rawConfig.ENABLE_RATE_LIMITING === 'true',
    ENABLE_HEALTH_CHECK_AUTH: rawConfig.ENABLE_HEALTH_CHECK_AUTH === 'true',
    HEALTH_CHECK_SECRET: rawConfig.HEALTH_CHECK_SECRET,
    MAX_CONNECTIONS_PER_IP: parseInt(rawConfig.MAX_CONNECTIONS_PER_IP || '10', 10),
    RATE_LIMIT_WINDOW_MS: parseInt(rawConfig.RATE_LIMIT_WINDOW_MS || '60000', 10),
    RATE_LIMIT_MAX_REQUESTS: parseInt(rawConfig.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    ENABLE_DETAILED_HEALTH: rawConfig.ENABLE_DETAILED_HEALTH === 'true'
  }

  validateConfig(config)
  return config
}

export function validateConfig(config: Config): void {
  const errors: string[] = []

  if (!config.PORT || isNaN(parseInt(config.PORT, 10))) {
    errors.push('PORT must be a valid port number')
  }

  if (!config.TCP_PORT || isNaN(parseInt(config.TCP_PORT, 10))) {
    errors.push('TCP_PORT must be a valid port number')
  }

  if (!config.UDP_PORT || isNaN(parseInt(config.UDP_PORT, 10))) {
    errors.push('UDP_PORT must be a valid port number')
  }

  if (!['error', 'warn', 'info', 'debug'].includes(config.LOG_LEVEL)) {
    errors.push('LOG_LEVEL must be one of: error, warn, info, debug')
  }

  if (!config.METRICS_PORT || isNaN(parseInt(config.METRICS_PORT, 10))) {
    errors.push('METRICS_PORT must be a valid port number')
  }

  if (config.MAX_CONNECTIONS <= 0) {
    errors.push('MAX_CONNECTIONS must be a positive number')
  }

  if (config.CONNECTION_TIMEOUT <= 0) {
    errors.push('CONNECTION_TIMEOUT must be a positive number')
  }

  if (config.HEALTH_CHECK_INTERVAL <= 0) {
    errors.push('HEALTH_CHECK_INTERVAL must be a positive number')
  }

  if (!config.HTTP_HEALTH_PORT || isNaN(parseInt(config.HTTP_HEALTH_PORT, 10))) {
    errors.push('HTTP_HEALTH_PORT must be a valid port number')
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
  }
}

export function getConfigWithDefaults(overrides: Partial<Config> = {}): Config {
  const defaults: Config = {
    PORT: '3000',
    TCP_PORT: '4000',
    UDP_PORT: '5000',
    LOG_LEVEL: 'info',
    METRICS_ENABLED: true,
    METRICS_PORT: '3001',
    PLUGIN_DIR: './plugins',
    MAX_CONNECTIONS: 1000,
    CONNECTION_TIMEOUT: 30000,
    HEALTH_CHECK_INTERVAL: 30000,
    ENABLE_HTTP_HEALTH: true,
    HTTP_HEALTH_PORT: '8080',
    MINECRAFT_TARGET_IP: '127.0.0.1',
    MINECRAFT_TARGET_PORT: '25566',
    // Security configuration defaults
    ENABLE_IP_FILTERING: false,
    ENABLE_RATE_LIMITING: false,
    ENABLE_HEALTH_CHECK_AUTH: false,
    HEALTH_CHECK_SECRET: undefined,
    MAX_CONNECTIONS_PER_IP: 10,
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    ENABLE_DETAILED_HEALTH: false
  }

  const merged = { ...defaults, ...overrides }
  validateConfig(merged)
  return merged
}

export function createConfigManager(config: Config) {
  return {
    getConfig(): Config {
      return { ...config }
    },

    updateConfig(updates: Partial<Config>): Config {
      const newConfig = { ...config, ...updates }
      validateConfig(newConfig)
      return newConfig
    },

    isMetricsEnabled(): boolean {
      return config.METRICS_ENABLED
    },

    isHttpHealthEnabled(): boolean {
      return config.ENABLE_HTTP_HEALTH
    },

    getPorts() {
      return {
        http: parseInt(config.PORT, 10),
        tcp: parseInt(config.TCP_PORT, 10),
        udp: parseInt(config.UDP_PORT, 10),
        metrics: parseInt(config.METRICS_PORT, 10),
        health: parseInt(config.HTTP_HEALTH_PORT, 10)
      }
    }
  }
}
