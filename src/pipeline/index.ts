type Middleware = (context: any, next: () => Promise<void>) => Promise<void>

export function createPipeline() {
  const middlewares: Middleware[] = []

  function use(middleware: Middleware) {
    middlewares.push(middleware)
  }

  async function process(context: any) {
    let index = 0

    async function next() {
      if (index < middlewares.length) {
        const middleware = middlewares[index++]
        if (middleware) {
          await middleware(context, next)
        }
      }
    }

    await next()
  }

  return {
    use,
    process
  }
}
