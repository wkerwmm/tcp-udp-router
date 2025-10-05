#!/usr/bin/env node

import { program } from 'commander'
import { createLogger } from '../logger'
import { createBenchmarkRunner, BenchmarkConfig } from './benchmarkRunner'
import { writeFileSync } from 'fs'
import { join } from 'path'

program
  .name('tcp-udp-router-benchmark')
  .description('Benchmark tool for TCP/UDP Router')
  .version('1.0.0')

program
  .command('run')
  .description('Run a benchmark')
  .option('-n, --name <name>', 'Benchmark name', 'default')
  .option('-p, --protocol <protocol>', 'Protocol (tcp|udp)', 'tcp')
  .option('-h, --host <host>', 'Target host', 'localhost')
  .option('-P, --port <port>', 'Target port', '4000')
  .option('-d, --duration <seconds>', 'Benchmark duration in seconds', '60')
  .option('-c, --concurrency <count>', 'Number of concurrent connections', '10')
  .option('-s, --message-size <bytes>', 'Message size in bytes', '1024')
  .option('-r, --rate <rate>', 'Message rate per second per connection', '0')
  .option('-w, --warmup <seconds>', 'Warmup duration in seconds', '10')
  .option('-C, --cooldown <seconds>', 'Cooldown duration in seconds', '5')
  .option('-t, --timeout <ms>', 'Connection timeout in milliseconds', '30000')
  .option('-o, --output <file>', 'Output file for results', 'benchmark-results.json')
  .option('-R, --report <file>', 'Generate markdown report', 'benchmark-report.md')
  .option('-v, --verbose', 'Verbose logging', false)
  .action(async (options) => {
    const logger = createLogger(options.verbose ? 'debug' : 'info')
    const runner = createBenchmarkRunner(logger)

    const config: BenchmarkConfig = {
      name: options.name,
      protocol: options.protocol as 'tcp' | 'udp',
      host: options.host,
      port: parseInt(options.port, 10),
      duration: parseInt(options.duration, 10),
      concurrency: parseInt(options.concurrency, 10),
      messageSize: parseInt(options.messageSize, 10),
      messageRate: parseInt(options.rate, 10) || undefined,
      warmupDuration: parseInt(options.warmup, 10),
      cooldownDuration: parseInt(options.cooldown, 10),
      timeout: parseInt(options.timeout, 10)
    }

    try {
      logger.info('Starting benchmark', config)
      
      const result = await runner.runBenchmark(config)
      
      // Save results to JSON file
      const results = runner.getResults()
      writeFileSync(options.output, JSON.stringify(results, null, 2))
      logger.info('Results saved to JSON file', { file: options.output })

      // Generate markdown report
      if (options.report) {
        const report = runner.generateReport()
        writeFileSync(options.report, report)
        logger.info('Report saved to markdown file', { file: options.report })
      }

      // Print summary
      console.log('\n=== Benchmark Summary ===')
      console.log(`Name: ${result.name}`)
      console.log(`Protocol: ${result.protocol}`)
      console.log(`Duration: ${result.duration.toFixed(2)}s`)
      console.log(`Concurrency: ${result.concurrency}`)
      console.log(`Throughput: ${result.throughput.toFixed(2)} msg/s`)
      console.log(`Error Rate: ${(result.errorRate * 100).toFixed(2)}%`)
      console.log(`Average Latency: ${result.latency.average.toFixed(2)}ms`)
      console.log(`P95 Latency: ${result.latency.p95.toFixed(2)}ms`)
      console.log(`P99 Latency: ${result.latency.p99.toFixed(2)}ms`)
      
    } catch (error) {
      logger.error('Benchmark failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      process.exit(1)
    }
  })

program
  .command('compare')
  .description('Compare benchmark results')
  .option('-f, --files <files...>', 'Result files to compare')
  .option('-o, --output <file>', 'Output comparison report', 'benchmark-comparison.md')
  .action(async (options) => {
    const logger = createLogger('info')
    
    if (!options.files || options.files.length < 2) {
      logger.error('At least 2 result files are required for comparison')
      process.exit(1)
    }

    try {
      const results = []
      for (const file of options.files) {
        const data = require(join(process.cwd(), file))
        results.push(data)
      }

      const comparison = generateComparisonReport(results)
      writeFileSync(options.output, comparison)
      
      logger.info('Comparison report generated', { file: options.output })
      console.log(`\nComparison report saved to: ${options.output}`)
      
    } catch (error) {
      logger.error('Comparison failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      process.exit(1)
    }
  })

program
  .command('stress')
  .description('Run stress test with increasing load')
  .option('-h, --host <host>', 'Target host', 'localhost')
  .option('-P, --port <port>', 'Target port', '4000')
  .option('-p, --protocol <protocol>', 'Protocol (tcp|udp)', 'tcp')
  .option('-d, --duration <seconds>', 'Duration per load level', '30')
  .option('-s, --step <count>', 'Concurrency step size', '5')
  .option('-m, --max <count>', 'Maximum concurrency', '50')
  .option('-o, --output <file>', 'Output file for results', 'stress-test-results.json')
  .action(async (options) => {
    const logger = createLogger('info')
    const runner = createBenchmarkRunner(logger)

    const results = []
    const step = parseInt(options.step, 10)
    const max = parseInt(options.max, 10)
    const duration = parseInt(options.duration, 10)

    try {
      for (let concurrency = step; concurrency <= max; concurrency += step) {
        logger.info('Running stress test level', { concurrency, max })
        
        const config: BenchmarkConfig = {
          name: `stress_${concurrency}`,
          protocol: options.protocol as 'tcp' | 'udp',
          host: options.host,
          port: parseInt(options.port, 10),
          duration,
          concurrency,
          messageSize: 1024,
          warmupDuration: 5,
          cooldownDuration: 2
        }

        const result = await runner.runBenchmark(config)
        results.push(result)

        // Check if we're hitting limits
        if (result.errorRate > 0.1) { // 10% error rate
          logger.warn('High error rate detected, stopping stress test', {
            concurrency,
            errorRate: result.errorRate
          })
          break
        }
      }

      // Save results
      writeFileSync(options.output, JSON.stringify(results, null, 2))
      logger.info('Stress test completed', { 
        levels: results.length,
        output: options.output 
      })

      // Print summary
      console.log('\n=== Stress Test Summary ===')
      for (const result of results) {
        console.log(`Concurrency ${result.concurrency}: ${result.throughput.toFixed(2)} msg/s, ${(result.errorRate * 100).toFixed(2)}% errors`)
      }
      
    } catch (error) {
      logger.error('Stress test failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      process.exit(1)
    }
  })

function generateComparisonReport(results: any[]): string {
  let report = '# Benchmark Comparison Report\n\n'
  
  report += '| Metric | ' + results.map((_, i) => `Test ${i + 1}`).join(' | ') + ' |\n'
  report += '|--------|' + results.map(() => '--------').join('|') + '|\n'
  
  // Throughput comparison
  report += '| Throughput (msg/s) | ' + results.map(r => r.throughput.toFixed(2)).join(' | ') + ' |\n'
  
  // Latency comparison
  report += '| Avg Latency (ms) | ' + results.map(r => r.latency.average.toFixed(2)).join(' | ') + ' |\n'
  report += '| P95 Latency (ms) | ' + results.map(r => r.latency.p95.toFixed(2)).join(' | ') + ' |\n'
  report += '| P99 Latency (ms) | ' + results.map(r => r.latency.p99.toFixed(2)).join(' | ') + ' |\n'
  
  // Error rate comparison
  report += '| Error Rate (%) | ' + results.map(r => (r.errorRate * 100).toFixed(2)).join(' | ') + ' |\n'
  
  // Resource usage comparison
  report += '| Memory (MB) | ' + results.map(r => (r.resourceUsage.memory / 1024 / 1024).toFixed(2)).join(' | ') + ' |\n'
  
  return report
}

program.parse()