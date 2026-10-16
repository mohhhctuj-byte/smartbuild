import { ArrowDownAZ, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, FolderKanban } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sortDiscoveryProjects, type DiscoverySortColumn, type DiscoverySortDirection } from "../../../shared/discoverySort";

export { sortDiscoveryProjects } from "../../../shared/discoverySort";
export type { DiscoverySortColumn, DiscoverySortDirection } from "../../../shared/discoverySort";

export type DiscoveryProject = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt?: string | null;
  conversationCount: number;
  generatedFileCount: number;
  activityCount: number;
  status: "idle" | "planned" | "writing" | "previewing" | "testing" | "verifying" | "succeeded" | "failed" | "blocked" | "timed_out" | "cancelled";
};

type DiscoveryData = {
  totals: { projects: number; conversations: number; generatedFiles: number; activities: number };
  projects: DiscoveryProject[];
  recentActivity: Array<{ id: string; projectId: number; projectName: string; type: string; occurredAt: string | null }>;
};

function relativeTime(value: string | null) {
  if (!value) return "No recorded activity";
  const hours = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 3_600_000));
  return hours < 1 ? "Just now" : hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded";
}

function projectStatusLabel(project: DiscoveryProject) {
  return ({ idle: "New", planned: "Planned", writing: "Writing", previewing: "Previewing", testing: "Testing", verifying: "Verifying", succeeded: "Verified", failed: "Failed", blocked: "Blocked", timed_out: "Timed out", cancelled: "Cancelled" } as const)[project.status];
}

export default function SmartBuildDiscovery({ selectedProjectId, onSelectProject, onProjectDeleted, onProjectArchived, refreshKey }: { selectedProjectId: number | null; onSelectProject: (id: number) => void; onProjectDeleted: (id: number) => void; onProjectArchived: (id: number) => void; refreshKey: number }) {
  const [data, setData] = useState<DiscoveryData | null>(null);
  const [open, setOpen] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active");
  const [sortColumn, setSortColumn] = useState<DiscoverySortColumn>("updatedAt");
  const [sortDirection, setSortDirection] = useState<DiscoverySortDirection>("desc");
  const [detailProject, setDetailProject] = useState<DiscoveryProject | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<DiscoveryProject | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [buildRefresh, setBuildRefresh] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetch(`/api/workspace/discovery?status=${archiveFilter}`, { credentials: "include" })
      .then(async response => response.ok ? response.json() as Promise<DiscoveryData> : null)
      .then(result => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [open, archiveFilter, refreshKey, buildRefresh]);

  useEffect(() => {
    const refresh = () => setBuildRefresh(value => value + 1);
    window.addEventListener("smartbuild:build-updated", refresh);
    return () => window.removeEventListener("smartbuild:build-updated", refresh);
  }, []);

  const sortedProjects = useMemo(() => sortDiscoveryProjects(data?.projects || [], sortColumn, sortDirection), [data, sortColumn, sortDirection]);
  const changeSort = (column: DiscoverySortColumn) => {
    if (sortColumn === column) setSortDirection(current => current === "asc" ? "desc" : "asc");
    else { setSortColumn(column); setSortDirection(column === "updatedAt" ? "desc" : "asc"); }
  };

  const removeProjectFromCurrentList = (project: DiscoveryProject) => {
    setData(current => current ? {
      ...current,
      totals: {
        projects: Math.max(0, current.totals.projects - 1),
        conversations: Math.max(0, current.totals.conversations - project.conversationCount),
        generatedFiles: Math.max(0, current.totals.generatedFiles - project.generatedFileCount),
        activities: Math.max(0, current.totals.activities - project.activityCount),
      },
      projects: current.projects.filter(item => item.id !== project.id),
      recentActivity: current.recentActivity.filter(item => item.projectId !== project.id),
    } : current);
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) return;
    const project = deleteCandidate;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/workspace/projects/${project.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("The project could not be deleted.");
      removeProjectFromCurrentList(project);
      setDetailProject(null);
      setDeleteCandidate(null);
      onProjectDeleted(project.id);
    } catch {
      setDeleteError("The project could not be deleted. It may already have been removed or is unavailable.");
    } finally {
      setDeleting(false);
    }
  };

  const toggleArchive = async () => {
    if (!detailProject) return;
    const project = detailProject;
    const action = archiveFilter === "archived" ? "restore" : "archive";
    setArchiving(true);
    setArchiveError(null);
    try {
      const response = await fetch(`/api/workspace/projects/${project.id}/${action}`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error(`The project could not be ${action}d.`);
      removeProjectFromCurrentList(project);
      setDetailProject(null);
      if (action === "archive") {
        window.dispatchEvent(new CustomEvent("smartbuild:project-archived", { detail: { projectId: project.id } }));
        onProjectArchived(project.id);
      }
    } catch {
      setArchiveError(action === "archive" ? "The project could not be archived. It remains available in the active list." : "The project could not be restored. It remains in the archive.");
    } finally {
      setArchiving(false);
    }
  };

  const SortButton = ({ column, children }: { column: DiscoverySortColumn; children: string }) => {
    const selected = sortColumn === column;
    return <button type="button" onClick={() => changeSort(column)} aria-label={`Sort projects by ${children}`} aria-sort={selected ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} className={`inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] transition hover:bg-white/[0.06] ${selected ? "text-cyan-100" : "text-slate-500"}`}>{children}{selected ? sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ArrowDownAZ className="h-3 w-3 opacity-50" />}</button>;
  };

  const hasProjects = Boolean(data?.projects.length);
  const archivedView = archiveFilter === "archived";

  return <>
    <button type="button" data-testid="projects-panel-trigger" onClick={() => setOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.035] px-2.5 text-xs font-medium text-slate-300 transition hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"><FolderKanban className="h-3.5 w-3.5 text-cyan-100" />Projects</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[min(46rem,calc(100vh-3rem))] overflow-y-auto border-white/[0.12] bg-[#111722] text-slate-100 sm:max-w-3xl">
        <DialogHeader><DialogTitle>Projects</DialogTitle><DialogDescription className="text-slate-400">Choose an active project to open its workspace. Archived projects remain preserved here until restored.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/10 px-3 py-2"><p className="text-[11px] text-slate-400">{archivedView ? "Archived projects are hidden from the workspace until restored." : "Active projects are available in the workspace."}</p><div className="inline-flex rounded-lg border border-white/[0.1] p-0.5" role="group" aria-label="Project status filter"><button type="button" aria-pressed={!archivedView} onClick={() => setArchiveFilter("active")} className={`rounded-md px-2 py-1 text-[10px] font-medium ${!archivedView ? "bg-cyan-200 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}>Active</button><button type="button" aria-pressed={archivedView} onClick={() => setArchiveFilter("archived")} className={`rounded-md px-2 py-1 text-[10px] font-medium ${archivedView ? "bg-cyan-200 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}>Archived</button></div></div>
          {hasProjects ? <div role="table" aria-label="SmartBuild projects" className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/15"><div role="row" className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 border-b border-white/[0.07] px-3 py-1.5 sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_5.5rem]"><SortButton column="name">Project</SortButton><span className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Files</span><SortButton column="status">Status</SortButton><span className="hidden text-[10px] uppercase tracking-[0.1em] text-slate-500 sm:block"><SortButton column="updatedAt">Updated</SortButton></span></div>{sortedProjects.map(project => <button key={project.id} type="button" role="row" onClick={() => { setArchiveError(null); setDetailProject(project); }} className={`grid w-full grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 border-b border-white/[0.05] px-3 py-2 text-left last:border-0 transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-300/60 sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_5.5rem] ${project.id === selectedProjectId ? "bg-cyan-300/[0.06]" : ""}`}><span className="min-w-0"><span className="block truncate text-xs font-medium text-slate-200">{project.name}</span><span className="block truncate text-[10px] text-slate-500">{project.description || "No project description"}</span></span><span className="text-[10px] text-slate-400">{project.generatedFileCount}</span><span className={`w-fit rounded-full px-2 py-0.5 text-[10px] ${project.status === "succeeded" ? "bg-cyan-300/10 text-cyan-100" : project.status === "failed" || project.status === "blocked" || project.status === "timed_out" ? "bg-rose-300/10 text-rose-100" : "bg-white/[0.06] text-slate-400"}`}>{projectStatusLabel(project)}</span><span className="hidden text-[10px] text-slate-500 sm:block">{relativeTime(project.updatedAt)}</span></button>)}</div> : <p className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-6 text-sm text-slate-400">{archivedView ? "No archived projects are available for this workspace." : "No active projects are available for this workspace yet."}</p>}
          {data?.recentActivity.length ? <p className="truncate text-[11px] text-slate-500">Recent: {data.recentActivity.slice(0, 2).map(item => `${item.projectName} · ${item.type}`).join("  ·  ")}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(detailProject)} onOpenChange={isOpen => { if (!isOpen) { setDetailProject(null); setArchiveError(null); } }}>
      <DialogContent className="border-white/[0.12] bg-[#111722] text-slate-100 sm:max-w-lg"><DialogHeader><DialogTitle>{detailProject?.name || "Project details"}</DialogTitle><DialogDescription className="text-slate-400">{detailProject?.description || "This project has no recorded description."}</DialogDescription></DialogHeader>{detailProject && <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Status</span><p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-cyan-100"><CheckCircle2 className="h-3.5 w-3.5" />{projectStatusLabel(detailProject)}</p></div><div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Last activity</span><p className="mt-1 text-sm font-medium text-slate-200">{relativeTime(detailProject.updatedAt)}</p></div><div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Conversations</span><p className="mt-1 text-sm font-medium text-slate-200">{detailProject.conversationCount}</p></div><div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Generated files</span><p className="mt-1 text-sm font-medium text-slate-200">{detailProject.generatedFileCount}</p></div><div className="col-span-2 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs text-slate-400"><CalendarClock className="h-3.5 w-3.5 text-cyan-200" />Created {formatDate(detailProject.createdAt)} · Updated {formatDate(detailProject.updatedAt)} · {detailProject.activityCount} activities</div></div>}{archiveError && <p role="alert" className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/[0.08] px-3 py-2 text-xs text-rose-100">{archiveError}</p>}<DialogFooter><button type="button" disabled={archiving} onClick={() => void toggleArchive()} className="mr-auto inline-flex h-9 items-center justify-center rounded-lg border border-amber-200/30 px-3 text-xs font-medium text-amber-100 transition hover:bg-amber-200/10 active:scale-[0.97] disabled:opacity-50">{archiving ? "Updating…" : archivedView ? "Restore project" : "Archive project"}</button>{!archivedView && <button type="button" onClick={() => detailProject && setDeleteCandidate(detailProject)} className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-300/30 px-3 text-xs font-medium text-rose-100 transition hover:bg-rose-300/10 active:scale-[0.97]">Delete project</button>}<button type="button" disabled={archivedView} onClick={() => { if (detailProject && !archivedView) { onSelectProject(detailProject.id); setDetailProject(null); } }} className="inline-flex h-9 items-center justify-center rounded-lg bg-cyan-200 px-3 text-xs font-medium text-slate-950 transition hover:bg-cyan-100 active:scale-[0.97] disabled:opacity-50">Open workspace</button></DialogFooter></DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleteCandidate)} onOpenChange={isOpen => { if (!isOpen && !deleting) { setDeleteCandidate(null); setDeleteError(null); } }}><DialogContent className="border-rose-300/25 bg-[#16111a] text-slate-100 sm:max-w-md"><DialogHeader><DialogTitle>Delete project permanently?</DialogTitle><DialogDescription className="text-slate-400">This removes <span className="font-medium text-slate-200">{deleteCandidate?.name}</span>, its conversations, Build Runs, artifacts, and workspace files. This cannot be undone.</DialogDescription></DialogHeader>{deleteError && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/[0.08] px-3 py-2 text-xs text-rose-100">{deleteError}</p>}<DialogFooter><button type="button" disabled={deleting} onClick={() => { setDeleteCandidate(null); setDeleteError(null); }} className="inline-flex h-9 items-center justify-center rounded-lg border border-white/[0.12] px-3 text-xs font-medium text-slate-200 disabled:opacity-50">Cancel</button><button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-300 px-3 text-xs font-semibold text-rose-950 transition hover:bg-rose-200 active:scale-[0.97] disabled:opacity-50">{deleting ? "Deleting…" : "Delete permanently"}</button></DialogFooter></DialogContent></Dialog>
  </>;
}
