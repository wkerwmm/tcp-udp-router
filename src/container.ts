export interface Container {
  register<T>(key: string, factory: (container: Container) => T, singleton?: boolean): void
  registerSingleton<T>(key: string, instance: T): void
  resolve<T>(key: string): T
  has(key: string): boolean
  getServiceKeys(): string[]
  dispose(): Promise<void>
}

interface ServiceDescriptor<T = any> {
  factory: (container: Container) => T
  singleton: boolean
  instance?: T
}

export function createContainer(): Container {
  const services = new Map<string, ServiceDescriptor>()
  const disposables: Array<{ dispose: () => Promise<void> | void }> = []

  function register<T>(key: string, factory: (container: Container) => T, singleton: boolean = true): void {
    if (services.has(key)) {
      throw new Error(`Service already registered: ${key}`)
    }
    services.set(key, { factory, singleton })
  }

  function registerSingleton<T>(key: string, instance: T): void {
    register(key, () => instance, true)
  }

  function resolve<T>(key: string): T {
    const descriptor = services.get(key)
    if (!descriptor) {
      throw new Error(`Service not found: ${key}`)
    }

    if (descriptor.singleton && descriptor.instance) {
      return descriptor.instance
    }

    const instance = descriptor.factory(container)
    
    if (descriptor.singleton) {
      descriptor.instance = instance
    }

    if (typeof (instance as any).dispose === 'function') {
      disposables.push(instance as any)
    }

    return instance
  }

  function has(key: string): boolean {
    return services.has(key)
  }

  function getServiceKeys(): string[] {
    return Array.from(services.keys())
  }

  async function dispose(): Promise<void> {
    for (const disposable of disposables.reverse()) {
      try {
        await Promise.resolve(disposable.dispose())
      } catch (error) {
        console.error('Error disposing service:', error)
      }
    }
    services.clear()
    disposables.length = 0
  }

  const container: Container = {
    register,
    registerSingleton,
    resolve,
    has,
    getServiceKeys,
    dispose
  }

  return container
}

export interface Disposable {
  dispose(): Promise<void> | void
}
