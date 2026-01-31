import dotenv from "dotenv";
import { brightWheelLogin } from "./src/brightwheel/login.js";
import { parentSquareLogin } from "./src/parentsquare/login.js";

dotenv.config();

async function runWithRetry(
  fn: () => Promise<void>,
  name: string,
  retries = 2,
  delayMs = 15000
) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      console.log(`▶️ ${name} — attempt ${attempt}`);
      await fn();
      console.log(`✅ ${name} completed successfully`);
      return;
    } catch (err) {
      console.error(`❌ ${name} failed (attempt ${attempt})`, err);

      if (attempt > retries) {
        throw new Error(`${name} failed after ${retries + 1} attempts`);
      }

      console.log(`⏳ Retrying ${name} in ${delayMs / 1000}s...`);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
}

async function main() {
  try {
    console.log("🚀 Cron job started");

    // Run both jobs independently in parallel
    const results = await Promise.allSettled([
      runWithRetry(brightWheelLogin, "BrightWheel Login"),
      runWithRetry(parentSquareLogin, "ParentSquare Login")
    ]);

    // Check if any failed
    const failures = results.filter(r => r.status === 'rejected');
    
    if (failures.length > 0) {
      console.error(`💥 ${failures.length} job(s) failed`);
      failures.forEach((failure, index) => {
        if (failure.status === 'rejected') {
          console.error(`  - Job ${index + 1}:`, failure.reason);
        }
      });
      process.exit(1);
    }

    console.log("🎉 All cron jobs completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("💥 Unexpected error", error);
    process.exit(1);
  }
}

main();
