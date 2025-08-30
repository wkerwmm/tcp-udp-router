import express from 'express'

export function startHttpServer(port: string, logger: any) {
  const app = express()

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() })
  })

  app.listen(port, () => {
    logger.info(`HTTP Health server listening on port ${port}`)
  })

  return app
}
