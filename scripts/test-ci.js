#!/usr/bin/env node

// CI Test Script - Starts server, runs tests, then cleans up
const { spawn } = require('child_process');
const { promisify } = require('util');

const sleep = promisify(setTimeout);

class CITestRunner {
  constructor() {
    this.serverProcess = null;
    this.testProcess = null;
  }

  async waitForServer(url = 'http://localhost:8080/health', maxAttempts = 30) {
    console.log('⏳ Waiting for server to be ready...');
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Check if fetch is available (Node.js 18+)
        if (typeof fetch === 'undefined') {
          // Fallback: use curl for health check
          const { execSync } = require('child_process');
          execSync('curl -f http://localhost:8080/health', { 
            stdio: 'ignore',
            timeout: 5000 
          });
          console.log('✅ Server is ready!');
          return true;
        } else {
          // Use built-in fetch
          const response = await fetch(url, { 
            signal: AbortSignal.timeout(5000)
          });
          if (response.ok) {
            console.log('✅ Server is ready!');
            return true;
          }
        }
      } catch (error) {
        // Server not ready yet, continue waiting
      }
      
      await sleep(1000);
      process.stdout.write('.');
    }
    
    throw new Error('Server failed to start within timeout');
  }

  async startServer() {
    console.log('🚀 Starting test server...');
    
    this.serverProcess = spawn('node', ['server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '8080'
      }
    });

    this.serverProcess.stdout.on('data', (data) => {
      console.log(`[SERVER] ${data.toString().trim()}`);
    });

    this.serverProcess.stderr.on('data', (data) => {
      console.error(`[SERVER ERROR] ${data.toString().trim()}`);
    });

    this.serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });

    // Wait for server to be ready
    await this.waitForServer();
  }

  async runTests() {
    console.log('🧪 Running integration tests...');
    
    return new Promise((resolve, reject) => {
      this.testProcess = spawn('node', ['test-integration.js'], {
        stdio: 'inherit',
        env: process.env
      });

      this.testProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ All tests passed!');
          resolve();
        } else {
          console.error(`❌ Tests failed with exit code ${code}`);
          reject(new Error(`Tests failed with exit code ${code}`));
        }
      });

      this.testProcess.on('error', (error) => {
        console.error('Failed to run tests:', error);
        reject(error);
      });
    });
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    if (this.testProcess) {
      this.testProcess.kill('SIGTERM');
    }
    
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      
      // Give the server a moment to shut down gracefully
      await sleep(2000);
      
      if (!this.serverProcess.killed) {
        this.serverProcess.kill('SIGKILL');
      }
    }
  }

  async run() {
    let exitCode = 0;
    
    try {
      await this.startServer();
      await this.runTests();
      console.log('🎉 CI tests completed successfully!');
    } catch (error) {
      console.error('💥 CI tests failed:', error.message);
      exitCode = 1;
    } finally {
      await this.cleanup();
      process.exit(exitCode);
    }
  }
}

// Handle cleanup on process signals
const testRunner = new CITestRunner();

process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, cleaning up...');
  await testRunner.cleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, cleaning up...');
  await testRunner.cleanup();
  process.exit(1);
});

// Run the tests
testRunner.run();