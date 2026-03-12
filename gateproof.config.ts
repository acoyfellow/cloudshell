import type { GateproofConfig } from "gateproof";

const config: GateproofConfig = {
  // Test directories
  testDirs: ["tests/integration", "tests/e2e"],

  // Coverage target
  coverage: {
    target: 80,
    reporters: ["text", "json"],
  },

  // Default test settings
  defaultTimeout: 30000,
  retries: 2,

  // Environment
  env: {
    BASE_URL: process.env.BASE_URL || "http://localhost:8787",
  },

  // Gate groups
  groups: {
    integration: {
      pattern: "tests/integration/**/*.gate.ts",
      timeout: 30000,
    },
    e2e: {
      pattern: "tests/e2e/**/*.gate.ts",
      timeout: 60000,
    },
  },
};

export default config;
