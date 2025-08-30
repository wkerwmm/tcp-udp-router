type Middleware = (context: any, next: () => void) => void

const loggingMiddleware: Middleware = (context, next) => {
  console.log(`[${context.protocol}] Session ${context.sessionId}: ${context.data.length} bytes`)
  next()
}

const echoMiddleware: Middleware = (context, next) => {
  if (context.protocol === 'tcp') {
    context.socket.write(context.data)
  } else if (context.protocol === 'udp') {
    context.server.send(context.data, context.rinfo.port, context.rinfo.address)
  }
  next()
}

const builtInMiddleware = [loggingMiddleware, echoMiddleware]

module.exports = {
  loggingMiddleware,
  echoMiddleware,
  builtInMiddleware
}
