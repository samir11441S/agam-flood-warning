// Cross-process lock for Agam's JSON files. The web server and the background worker are separate
// processes that read-modify-write the same files (alerts, deliveries, audit log); without a lock, one
// process can overwrite what the other just wrote (a lost approval, a lost "call answered").
// The lock is a directory: creating one is atomic on every OS. `fn` must be synchronous.
import fs from "node:fs";

const STALE_MS = 10_000; // a lock older than this belongs to a crashed process
const TIMEOUT_MS = 15_000;
const pause = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms: number) => Atomics.wait(pause, 0, 0, ms);

export function withFileLock<T>(file: string, fn: () => T): T {
  const lock = `${file}.lock`;
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > STALE_MS) {
          fs.rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue; // released between our mkdir and stat
      }
      if (Date.now() - start > TIMEOUT_MS) throw new Error(`Timed out waiting for the lock on ${file}`);
      sleep(5);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}
