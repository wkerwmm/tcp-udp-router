import { Plugin } from './pluginManager'

const examplePlugin: Plugin = {
  name: 'examplePlugin',
  initialize(container) {
    const logger = container.resolve('logger')
    logger.info('Example plugin initialized')
  }
}

export default examplePlugin
