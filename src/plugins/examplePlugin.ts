import { Plugin } from './pluginManager'
import { StructuredLogger } from '../logger'

const examplePlugin: Plugin = {
  name: 'examplePlugin',
  initialize(container) {
    const logger = container.resolve<StructuredLogger>('logger')
    logger.info('Example plugin initialized')
  },
  dispose() {
    // Cleanup logic if needed
  }
}

export default examplePlugin
