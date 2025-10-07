/**
 * {{PROJECT_NAME}} - Hello World Application
 * Generated from Generic Entity Framework template
 * Created: {{TIMESTAMP}}
 */

import { GenericEntityServer } from './main.mjs';

async function start() {
  // Create server instance
  const server = new GenericEntityServer();
  
  try {
    console.log('🚀 Starting {{PROJECT_NAME}}...');
    
    // Initialize the server
    await server.start();
    
    // Start listening for requests
    await server.listen();
    
    // Show available endpoints
    server.logEndpoints();
    
    // Show helpful information
    console.log('\n🎉 Hello World Application Started!');
    console.log('\n📍 Try these URLs:');
    console.log('   • http://localhost:3000/health');
    console.log('   • http://localhost:3000/api');
    console.log('   • http://demo.localhost:3000/app/demo/hello    (subdomain)');
    console.log('   • http://localhost:3000/tenants/demo/hello     (path-based)');
    console.log('   • http://localhost:3000/api/hello?tenant=demo  (query-based)');
    console.log('   • http://localhost:3000/admin/entities         (admin)');
    
    console.log('\n💡 Tips:');
    console.log('   • Edit entities/tenants/demo/ to customize the demo');
    console.log('   • Add new tenants by creating directories in entities/tenants/');
    console.log('   • Check entity-config.json to modify identification strategies');
    console.log('   • See USAGE.md for comprehensive documentation');
    
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    
    // Show helpful debugging information
    if (err.message.includes('EADDRINUSE')) {
      console.log('\n💡 Port already in use. Try:');
      console.log('   export PORT=3001 && npm start');
    } else if (err.message.includes('validation')) {
      console.log('\n💡 Check your entity-config.json for syntax errors');
    }
    
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Gracefully shutting down...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 Gracefully shutting down...');
  process.exit(0);
});

// Start the application
start();