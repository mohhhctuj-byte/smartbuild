import { open, readFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";

type LocalAdvancementLease = {
  token: string;
  ownerPid: number;
  createdAt: string;
};

const buildIdPattern = /^[A-Za-z0-9-]{1,100}$/;

function leasePath(stateRoot: string, userId: number, buildRunId: string) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !buildIdPattern.test(buildRunId)) {
    throw new Error("LOCAL_BUILD_RUN_ADVANCEMENT_SCOPE_INVALID");
  }
  return path.join(stateRoot, String(userId), `${buildRunId}.advance-lock`);
}

function ownerProcessIsAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    throw error;
  }
}

async function readLease(filename: string) {
  try {
    const parsed = JSON.parse(await readFile(filename, "utf8")) as Partial<LocalAdvancementLease>;
    if (typeof parsed.token !== "string" || !Number.isSafeInteger(parsed.ownerPid) || typeof parsed.createdAt !== "string") {
      throw new Error("LOCAL_BUILD_RUN_ADVANCEMENT_LEASE_INVALID");
    }
    return parsed as LocalAdvancementLease;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function removeStaleLease(filename: string) {
  const recoveryPath = `${filename}.recovery`;
  let recoveryHandle;
  try {
    recoveryHandle = await open(recoveryPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    const current = await readLease(filename);
    if (!current) return true;
    if (ownerProcessIsAlive(current.ownerPid)) return false;
    await rm(filename, { force: true });
    return true;
  } finally {
    await recoveryHandle.close();
    await rm(recoveryPath, { force: true });
  }
}

export async function claimLocalBuildRunAdvancement(
  userId: number,
  buildRunId: string,
  token: string,
  stateRoot: string,
) {
  const filename = leasePath(stateRoot, userId, buildRunId);
  await mkdir(path.dirname(filename), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let handle;
    try {
      handle = await open(filename, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const current = await readLease(filename);
      if (current && ownerProcessIsAlive(current.ownerPid)) return false;
      if (!(await removeStaleLease(filename))) return false;
      continue;
    }
    try {
      await handle.writeFile(JSON.stringify({ token, ownerPid: process.pid, createdAt: new Date().toISOString() } satisfies LocalAdvancementLease));
      await handle.sync();
      return true;
    } finally {
      await handle.close();
    }
  }
  return false;
}

export async function releaseLocalBuildRunAdvancement(
  userId: number,
  buildRunId: string,
  token: string,
  stateRoot: string,
) {
  const filename = leasePath(stateRoot, userId, buildRunId);
  const current = await readLease(filename);
  if (!current || current.token !== token) return false;
  await rm(filename, { force: true });
  return true;
}
