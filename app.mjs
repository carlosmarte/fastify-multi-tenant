#!/usr/bin/env node

/**
 * Generic Entity System Application Launcher
 *
 * This file demonstrates how to initialize and start the Generic Entity System
 * with multiple entity types configured.
 */

import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

// Load environment variables
dotenvExpand.expand(dotenv.config({ path: [".env.local", ".env"] }));

import { GenericEntityServer } from "./main.mjs";

async function launchServer() {
  try {
    console.log("🚀 Starting Generic Entity System Server...");

    // Create server instance with configuration
    const server = new GenericEntityServer({
      server: {
        port: parseInt(process.env.PORT, 10) || 3000,
        host: process.env.HOST || "127.0.0.1",
      },
      logger: {
        level: process.env.LOG_LEVEL || "info",
        pretty: process.env.NODE_ENV !== "production",
      },
      entities: {
        autoLoad: true, // Automatically load entities on startup
      },
    });

    // Start the server (loads configuration and initializes components)
    await server.start({
      entityConfigPath: "./entity-config.json", // Path to entity configuration
    });

    // Start listening for requests
    const app = await server.listen();

    // Log high-level route patterns (wildcards)
    server.logEndpoints();

    // Setup ready handler
    app.ready(() => {
      console.log("\n✨ Generic Entity System is ready!");
      console.log("   Supporting multiple entity types through configuration");
      console.log("   No code changes needed for new entity types!");

      // Show actual registered routes using Fastify's printRoutes
      console.log("\n📋 Actual Registered Routes:");
      console.log("─".repeat(50));
      console.log(app.printRoutes({ commonPrefix: false }));
      console.log("─".repeat(50));
      console.log("\n🌐 Server running at http://localhost:3000");
    });

  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Shutting down gracefully...");
  process.exit(0);
});

// Launch the server
launchServer().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});