#!/usr/bin/env node
// CLI binary entry point.

import { main } from "./cli.js";

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
