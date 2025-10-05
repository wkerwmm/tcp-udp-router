import { StructuredLogger } from '../logger'
import { MetricsCollector } from '../metrics'

export interface Resource {
  id: string
  type: string
  dispose(): Promise<void> | void
  isDisposed: boolean
  createdAt: Date
  metadata?: Record<string, any>
}

export interface ResourceStats {
  totalResources: number
  resourcesByType: Record<string, number>
  disposedResources: number
  activeResources: number
}

export class ResourceManager {
  private resources: Map<string, Resource>
  private logger: StructuredLogger
  private metrics?: MetricsCollector
  private isShuttingDown: boolean

  constructor(logger: StructuredLogger, metrics?: MetricsCollector) {
    this.resources = new Map()
    this.logger = logger
    this.metrics = metrics
    this.isShuttingDown = false
  }

  registerResource(resource: Resource): void {
    if (this.isShuttingDown) {
      this.logger.warn('Attempted to register resource during shutdown', {
        resourceId: resource.id,
        resourceType: resource.type
      })
      return
    }

    if (this.resources.has(resource.id)) {
      this.logger.warn('Resource already registered', {
        resourceId: resource.id,
        resourceType: resource.type
      })
      return
    }

    this.resources.set(resource.id, resource)
    this.metrics?.incrementError('resource_registered', resource.type)
    
    this.logger.debug('Resource registered', {
      resourceId: resource.id,
      resourceType: resource.type,
      totalResources: this.resources.size
    })
  }

  async disposeResource(resourceId: string): Promise<boolean> {
    const resource = this.resources.get(resourceId)
    if (!resource) {
      this.logger.warn('Resource not found for disposal', { resourceId })
      return false
    }

    if (resource.isDisposed) {
      this.logger.debug('Resource already disposed', { resourceId })
      return true
    }

    try {
      await Promise.resolve(resource.dispose())
      resource.isDisposed = true
      this.metrics?.incrementError('resource_disposed', resource.type)
      
      this.logger.debug('Resource disposed successfully', {
        resourceId,
        resourceType: resource.type
      })
      
      return true
    } catch (error) {
      this.logger.error('Error disposing resource', {
        resourceId,
        resourceType: resource.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.metrics?.incrementError('resource_disposal_error', resource.type)
      return false
    }
  }

  async disposeResourcesByType(type: string): Promise<number> {
    const resourcesToDispose = Array.from(this.resources.values())
      .filter(resource => resource.type === type && !resource.isDisposed)

    let disposedCount = 0
    for (const resource of resourcesToDispose) {
      if (await this.disposeResource(resource.id)) {
        disposedCount++
      }
    }

    this.logger.info('Disposed resources by type', {
      type,
      disposedCount,
      totalOfType: resourcesToDispose.length
    })

    return disposedCount
  }

  async disposeAllResources(): Promise<ResourceStats> {
    this.isShuttingDown = true
    const stats = this.getStats()
    
    this.logger.info('Starting disposal of all resources', stats)

    const disposalPromises = Array.from(this.resources.values())
      .filter(resource => !resource.isDisposed)
      .map(async (resource) => {
        try {
          await Promise.resolve(resource.dispose())
          resource.isDisposed = true
          this.metrics?.incrementError('resource_disposed', resource.type)
          return { success: true, resourceId: resource.id }
        } catch (error) {
          this.logger.error('Error disposing resource during shutdown', {
            resourceId: resource.id,
            resourceType: resource.type,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          this.metrics?.incrementError('resource_disposal_error', resource.type)
          return { success: false, resourceId: resource.id, error }
        }
      })

    const results = await Promise.all(disposalPromises)
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    this.logger.info('Resource disposal completed', {
      totalResources: this.resources.size,
      successfulDisposals: successCount,
      failedDisposals: failureCount
    })

    return this.getStats()
  }

  getResource(resourceId: string): Resource | undefined {
    return this.resources.get(resourceId)
  }

  getResourcesByType(type: string): Resource[] {
    return Array.from(this.resources.values()).filter(resource => resource.type === type)
  }

  getAllResources(): Resource[] {
    return Array.from(this.resources.values())
  }

  getStats(): ResourceStats {
    const resources = Array.from(this.resources.values())
    const resourcesByType: Record<string, number> = {}
    
    for (const resource of resources) {
      resourcesByType[resource.type] = (resourcesByType[resource.type] || 0) + 1
    }

    return {
      totalResources: resources.length,
      resourcesByType,
      disposedResources: resources.filter(r => r.isDisposed).length,
      activeResources: resources.filter(r => !r.isDisposed).length
    }
  }

  removeResource(resourceId: string): boolean {
    const resource = this.resources.get(resourceId)
    if (!resource) {
      return false
    }

    if (!resource.isDisposed) {
      this.logger.warn('Removing undisposed resource', {
        resourceId,
        resourceType: resource.type
      })
    }

    this.resources.delete(resourceId)
    this.logger.debug('Resource removed from manager', { resourceId })
    return true
  }

  cleanupDisposedResources(): number {
    const disposedResources = Array.from(this.resources.entries())
      .filter(([_, resource]) => resource.isDisposed)

    let removedCount = 0
    for (const [resourceId] of disposedResources) {
      this.resources.delete(resourceId)
      removedCount++
    }

    if (removedCount > 0) {
      this.logger.debug('Cleaned up disposed resources', { removedCount })
    }

    return removedCount
  }

  isResourceRegistered(resourceId: string): boolean {
    return this.resources.has(resourceId)
  }

  getResourceCount(): number {
    return this.resources.size
  }
}

export function createResourceManager(
  logger: StructuredLogger,
  metrics?: MetricsCollector
): ResourceManager {
  return new ResourceManager(logger, metrics)
}