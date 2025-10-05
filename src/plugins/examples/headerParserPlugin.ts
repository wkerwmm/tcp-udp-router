import { BasePlugin, PluginContext, PluginConfig, PluginMetadata } from '../pluginAPI'

export interface HeaderParserPluginConfig extends PluginConfig {
  settings: {
    enabled: boolean
    headerFormat: 'json' | 'key-value' | 'custom'
    customDelimiter?: string
    customPattern?: string
    extractHeaders: string[]
    addToMetadata: boolean
    validateHeaders: boolean
    requiredHeaders: string[]
  }
}

interface ParsedHeaders {
  [key: string]: string | number | boolean
}

export class HeaderParserPlugin extends BasePlugin {
  private parsedHeadersCount = 0
  private parseErrorsCount = 0

  async onInitialize(): Promise<void> {
    this.log('info', 'Header parser plugin initialized', {
      headerFormat: this.getSetting('headerFormat'),
      extractHeaders: this.getSetting('extractHeaders'),
      addToMetadata: this.getSetting('addToMetadata')
    })
  }

  async onStart(): Promise<void> {
    this.log('info', 'Header parser plugin started')
  }

  async onStop(): Promise<void> {
    this.log('info', 'Header parser plugin stopped', {
      parsedHeaders: this.parsedHeadersCount,
      parseErrors: this.parseErrorsCount
    })
  }

  async onError(error: Error): Promise<void> {
    this.parseErrorsCount++
    this.log('error', 'Header parser plugin error', {
      error: error.message,
      stack: error.stack
    })
  }

  async process(context: PluginContext): Promise<PluginContext | null> {
    if (!this.getSetting('enabled', true)) {
      return context
    }

    try {
      const parsedHeaders = this.parseHeaders(context.data)
      
      if (parsedHeaders) {
        this.parsedHeadersCount++
        
        // Validate headers if enabled
        if (this.getSetting('validateHeaders', false)) {
          const validationResult = this.validateHeaders(parsedHeaders)
          if (!validationResult.valid) {
            this.log('warn', 'Header validation failed', {
              sessionId: context.sessionId,
              errors: validationResult.errors
            })
            this.parseErrorsCount++
            return null
          }
        }

        // Add to metadata if enabled
        if (this.getSetting('addToMetadata', true)) {
          context.metadata = {
            ...context.metadata,
            headers: parsedHeaders
          }
        }

        this.log('debug', 'Headers parsed successfully', {
          sessionId: context.sessionId,
          headerCount: Object.keys(parsedHeaders).length,
          headers: Object.keys(parsedHeaders)
        })

        this.incrementCounter('headers_parsed', { 
          format: this.getSetting('headerFormat') 
        })
      }

      return context
    } catch (error) {
      this.parseErrorsCount++
      this.log('error', 'Failed to parse headers', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.incrementCounter('header_parse_errors', { 
        format: this.getSetting('headerFormat') 
      })
      
      return context // Continue processing even if header parsing fails
    }
  }

  private parseHeaders(data: Buffer): ParsedHeaders | null {
    const dataStr = data.toString()
    const format = this.getSetting('headerFormat', 'json')
    
    switch (format) {
      case 'json':
        return this.parseJsonHeaders(dataStr)
      case 'key-value':
        return this.parseKeyValueHeaders(dataStr)
      case 'custom':
        return this.parseCustomHeaders(dataStr)
      default:
        this.log('warn', 'Unknown header format', { format })
        return null
    }
  }

  private parseJsonHeaders(dataStr: string): ParsedHeaders | null {
    try {
      const parsed = JSON.parse(dataStr)
      
      if (typeof parsed === 'object' && parsed !== null) {
        const extractHeaders = this.getSetting('extractHeaders', [])
        
        if (extractHeaders.length === 0) {
          return parsed
        }
        
        const filtered: ParsedHeaders = {}
        for (const header of extractHeaders) {
          if (parsed.hasOwnProperty(header)) {
            filtered[header] = parsed[header]
          }
        }
        
        return filtered
      }
      
      return null
    } catch (error) {
      this.log('debug', 'Failed to parse JSON headers', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return null
    }
  }

  private parseKeyValueHeaders(dataStr: string): ParsedHeaders | null {
    const lines = dataStr.split('\n')
    const headers: ParsedHeaders = {}
    const extractHeaders = this.getSetting('extractHeaders', [])
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue
      
      const colonIndex = trimmedLine.indexOf(':')
      if (colonIndex === -1) continue
      
      const key = trimmedLine.substring(0, colonIndex).trim()
      const value = trimmedLine.substring(colonIndex + 1).trim()
      
      // Extract only specified headers if configured
      if (extractHeaders.length === 0 || extractHeaders.includes(key)) {
        headers[key] = this.parseValue(value)
      }
    }
    
    return Object.keys(headers).length > 0 ? headers : null
  }

  private parseCustomHeaders(dataStr: string): ParsedHeaders | null {
    const delimiter = this.getSetting('customDelimiter', '|')
    const pattern = this.getSetting('customPattern')
    
    if (!pattern) {
      this.log('warn', 'Custom pattern not configured')
      return null
    }
    
    try {
      const regex = new RegExp(pattern, 'g')
      const matches = dataStr.match(regex)
      
      if (!matches) return null
      
      const headers: ParsedHeaders = {}
      const extractHeaders = this.getSetting('extractHeaders', [])
      
      for (const match of matches) {
        const parts = match.split(delimiter)
        if (parts.length >= 2) {
          const key = parts[0].trim()
          const value = parts.slice(1).join(delimiter).trim()
          
          if (extractHeaders.length === 0 || extractHeaders.includes(key)) {
            headers[key] = this.parseValue(value)
          }
        }
      }
      
      return Object.keys(headers).length > 0 ? headers : null
    } catch (error) {
      this.log('error', 'Failed to parse custom headers', {
        error: error instanceof Error ? error.message : 'Unknown error',
        pattern
      })
      return null
    }
  }

  private parseValue(value: string): string | number | boolean {
    // Try to parse as number
    if (!isNaN(Number(value))) {
      return Number(value)
    }
    
    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
    
    // Return as string
    return value
  }

  private validateHeaders(headers: ParsedHeaders): { valid: boolean; errors: string[] } {
    const requiredHeaders = this.getSetting('requiredHeaders', [])
    const errors: string[] = []
    
    for (const required of requiredHeaders) {
      if (!headers.hasOwnProperty(required)) {
        errors.push(`Missing required header: ${required}`)
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }

  getStats(): {
    parsedHeaders: number
    parseErrors: number
  } {
    return {
      parsedHeaders: this.parsedHeadersCount,
      parseErrors: this.parseErrorsCount
    }
  }
}

export const headerParserPluginMetadata: PluginMetadata = {
  name: 'header_parser',
  version: '1.0.0',
  description: 'Parses headers from incoming messages in various formats',
  author: 'TCP/UDP Router Team',
  license: 'MIT',
  configSchema: {
    enabled: {
      type: 'boolean',
      default: true,
      description: 'Whether header parsing is enabled'
    },
    headerFormat: {
      type: 'string',
      enum: ['json', 'key-value', 'custom'],
      default: 'json',
      description: 'Format of headers to parse'
    },
    customDelimiter: {
      type: 'string',
      default: '|',
      description: 'Delimiter for custom format (only used when headerFormat is custom)'
    },
    customPattern: {
      type: 'string',
      description: 'Regex pattern for custom format (only used when headerFormat is custom)'
    },
    extractHeaders: {
      type: 'array',
      items: { type: 'string' },
      default: [],
      description: 'Specific headers to extract (empty array means extract all)'
    },
    addToMetadata: {
      type: 'boolean',
      default: true,
      description: 'Whether to add parsed headers to message metadata'
    },
    validateHeaders: {
      type: 'boolean',
      default: false,
      description: 'Whether to validate parsed headers'
    },
    requiredHeaders: {
      type: 'array',
      items: { type: 'string' },
      default: [],
      description: 'Required headers for validation'
    }
  }
}