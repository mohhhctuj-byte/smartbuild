import { writeFile } from "node:fs/promises";
import { getDurableBuildRunForUser, listGeneratedFilesForBuildRun } from "../server/db";
import { exportBuildWorkspaceZip, type BuildRun } from "../server/verifiedBuildPipeline";

const userId = 4980001;
const ids = {
  maya: "5d879144-bcc5-4249-b4d6-13d7b1f51ec6",
  bella: "aed2b13a-5955-4705-84cb-726593c2404b",
};

for (const [name, id] of Object.entries(ids)) {
  const durable = await getDurableBuildRunForUser(userId, id);
  if (!durable) throw new Error(`RUN_NOT_FOUND:${id}`);
  const run = JSON.parse(durable.payload) as BuildRun;
  const zip = await exportBuildWorkspaceZip(run, { listGeneratedFilesForBuildRun });
  await writeFile(`/home/ubuntu/${name}-release-v3.zip`, zip);
  console.log(`${name}:${zip.length}`);
}
