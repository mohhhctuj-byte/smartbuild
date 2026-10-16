import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const INITIALIZATION_GRACE_MS = 30_000;

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

export function acquireLocalStateLock(stateFilePath: string) {
  const lockPath = `${stateFilePath}.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const nonce = randomUUID();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath, "wx");
      try {
        fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, nonce }));
      } finally {
        fs.closeSync(descriptor);
      }
      return () => {
        try {
          const owner = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid?: number; nonce?: string };
          if (owner.pid === process.pid && owner.nonce === nonce) fs.unlinkSync(lockPath);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
      };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;

      let stale = false;
      try {
        const lockStat = fs.statSync(lockPath);
        const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid?: number };
        if (typeof lock.pid === "number" && Number.isInteger(lock.pid) && lock.pid > 0) {
          stale = !processIsAlive(lock.pid);
        } else {
          stale = Date.now() - lockStat.mtimeMs > INITIALIZATION_GRACE_MS;
        }
      } catch (readError) {
        if (readError instanceof Error && "code" in readError && readError.code === "ENOENT") continue;
        stale = false;
      }

      if (!stale) {
        throw new Error("Local SmartBuild state is already in use by another server process. Stop the other server or configure DATABASE_URL.");
      }
      try {
        fs.unlinkSync(lockPath);
      } catch (unlinkError) {
        if (!(unlinkError instanceof Error && "code" in unlinkError && unlinkError.code === "ENOENT")) throw unlinkError;
      }
    }
  }

  throw new Error("Could not acquire the local SmartBuild state lock.");
}
