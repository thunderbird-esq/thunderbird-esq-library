/**
 * Connection Pooling Configuration for Thunderbird ESQ Library
 * 
 * This module provides connection pooling setup for production database operations.
 * Critical for handling concurrent RAG ingestion requests and chat queries.
 */

// Production connection pool configuration
const connectionPoolConfig = {
  // Connection Pool Settings
  pool: {
    // Maximum number of connections in the pool
    max: 20,
    
    // Minimum number of connections to maintain
    min: 2,
    
    // Time to wait for connection before timing out (ms)
    acquire: 30000,
    
    // Maximum time connection can be idle before being released (ms)
    idle: 10000,
    
    // Maximum lifetime of a connection (ms)
    maxLifetime: 3600000, // 1 hour
    
    // Enable connection validation
    validate: true,
    
    // Connection validation query
    validationQuery: 'SELECT 1',
    
    // Test connection on borrow
    testOnBorrow: true,
    
    // Test connection on return
    testOnReturn: false,
    
    // Test idle connections
    testWhileIdle: true,
  },
  
  // Database-specific settings
  database: {
    // Connection timeout (ms)
    connectionTimeout: 60000,
    
    // Statement timeout (ms) - important for vector operations
    statementTimeout: 300000, // 5 minutes for embedding operations
    
    // Lock timeout (ms)
    lockTimeout: 30000,
    
    // Idle in transaction timeout (ms)
    idleInTransactionTimeout: 60000,
  },
  
  // Vector-specific optimizations
  vector: {
    // Enable parallel execution for batch operations
    enableParallelExecution: true,
    
    // Batch size for vector insertions
    batchSize: 100,
    
    // Connection pool for vector operations
    vectorPoolSize: 5,
    
    // Enable connection reuse for embedding operations
    reuseConnections: true,
  },
  
  // Monitoring and health checks
  monitoring: {
    // Enable connection pool monitoring
    enabled: true,
    
    // Health check interval (ms)
    healthCheckInterval: 30000,
    
    // Log slow queries (ms threshold)
    slowQueryThreshold: 5000,
    
    // Enable connection leak detection
    detectConnectionLeaks: true,
    
    // Connection leak threshold (ms)
    leakDetectionThreshold: 60000,
  },
  
  // Retry configuration
  retry: {
    // Maximum number of retries
    maxRetries: 3,
    
    // Base delay between retries (ms)
    baseDelay: 1000,
    
    // Maximum delay between retries (ms)
    maxDelay: 10000,
    
    // Exponential backoff multiplier
    backoffMultiplier: 2,
    
    // Retry on connection errors
    retryOnConnectionError: true,
    
    // Retry on timeout errors
    retryOnTimeout: true,
  }
};

// Supabase-specific connection pool implementation
class SupabaseConnectionPool {
  constructor(config = connectionPoolConfig) {
    this.config = config;
    this.connections = new Map();
    this.activeConnections = 0;
    this.maxConnections = config.pool.max;
    this.minConnections = config.pool.min;
    
    // Initialize monitoring
    if (config.monitoring.enabled) {
      this.initializeMonitoring();
    }
  }
  
  /**
   * Get connection from pool with retry logic
   */
  async getConnection(retryCount = 0) {
    try {
      // Check if we have available connections
      if (this.activeConnections < this.maxConnections) {
        const connection = await this.createConnection();
        this.activeConnections++;
        return connection;
      }
      
      // Wait for available connection
      await this.waitForConnection();
      return this.getConnection(retryCount);
      
    } catch (error) {
      if (retryCount < this.config.retry.maxRetries) {
        const delay = Math.min(
          this.config.retry.baseDelay * Math.pow(this.config.retry.backoffMultiplier, retryCount),
          this.config.retry.maxDelay
        );
        
        await this.sleep(delay);
        return this.getConnection(retryCount + 1);
      }
      
      throw new Error(`Failed to get database connection after ${retryCount} retries: ${error.message}`);
    }
  }
  
  /**
   * Release connection back to pool
   */
  async releaseConnection(connection) {
    try {
      // Validate connection before releasing
      if (this.config.pool.testOnReturn) {
        await this.validateConnection(connection);
      }
      
      this.activeConnections--;
      
      // Keep minimum connections alive
      if (this.activeConnections < this.minConnections) {
        return; // Keep connection alive
      }
      
      // Close excess connections
      await connection.end();
      
    } catch (error) {
      console.error('Error releasing connection:', error);
      this.activeConnections--;
    }
  }
  
  /**
   * Create new database connection
   */
  async createConnection() {
    const { createClient } = await import('@supabase/supabase-js');
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        db: {
          connectionTimeout: this.config.database.connectionTimeout,
          statementTimeout: this.config.database.statementTimeout,
        },
        global: {
          headers: {
            'x-connection-pool': 'true',
          },
        },
      }
    );
    
    return supabase;
  }
  
  /**
   * Validate connection health
   */
  async validateConnection(connection) {
    try {
      const { data, error } = await connection
        .from('documents')
        .select('count(*)')
        .limit(1);
      
      if (error) {
        throw new Error(`Connection validation failed: ${error.message}`);
      }
      
      return true;
    } catch (error) {
      throw new Error(`Connection validation failed: ${error.message}`);
    }
  }
  
  /**
   * Wait for available connection
   */
  async waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection wait timeout'));
      }, this.config.pool.acquire);
      
      const checkConnection = () => {
        if (this.activeConnections < this.maxConnections) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      
      checkConnection();
    });
  }
  
  /**
   * Initialize connection monitoring
   */
  initializeMonitoring() {
    setInterval(() => {
      console.log(`Connection Pool Status: Active=${this.activeConnections}/${this.maxConnections}`);
      
      // Check for connection leaks
      if (this.config.monitoring.detectConnectionLeaks) {
        this.detectConnectionLeaks();
      }
      
    }, this.config.monitoring.healthCheckInterval);
  }
  
  /**
   * Detect connection leaks
   */
  detectConnectionLeaks() {
    const now = Date.now();
    
    for (const [connectionId, connectionInfo] of this.connections.entries()) {
      const age = now - connectionInfo.createdAt;
      
      if (age > this.config.monitoring.leakDetectionThreshold) {
        console.warn(`Potential connection leak detected: ${connectionId} (age: ${age}ms)`);
      }
    }
  }
  
  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Gracefully shutdown connection pool
   */
  async shutdown() {
    console.log('Shutting down connection pool...');
    
    // Wait for active connections to finish
    while (this.activeConnections > 0) {
      await this.sleep(100);
    }
    
    console.log('Connection pool shutdown complete');
  }
}

// Export configuration and pool class
module.exports = {
  connectionPoolConfig,
  SupabaseConnectionPool,
  
  // Helper function to create configured pool
  createConnectionPool: (customConfig = {}) => {
    const config = {
      ...connectionPoolConfig,
      ...customConfig,
    };
    
    return new SupabaseConnectionPool(config);
  },
  
  // Production-ready pool configuration
  productionPoolConfig: {
    ...connectionPoolConfig,
    pool: {
      ...connectionPoolConfig.pool,
      max: 50, // Higher for production
      min: 5,  // Maintain more connections
    },
    database: {
      ...connectionPoolConfig.database,
      statementTimeout: 600000, // 10 minutes for large operations
    },
  },
};