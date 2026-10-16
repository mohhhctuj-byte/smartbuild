import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type WorkspaceListDeleteControlProps = {
  projectId: number;
  projectName: string;
};

export function WorkspaceListDeleteControl({ projectId, projectName }: WorkspaceListDeleteControlProps) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspace/projects/${projectId}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload && typeof payload.error === "string" ? payload.error : "The selected workspace could not be deleted. Please retry.";
        throw new Error(message);
      }
      setOpen(false);
      window.dispatchEvent(new CustomEvent("smartbuild:project-deleted", { detail: { projectId } }));
    } catch (error) {
      const networkFailure = error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message);
      setError(networkFailure
        ? "SmartBuild could not be reached, so deletion was not confirmed. Check the connection and retry."
        : error instanceof Error ? error.message : "The selected workspace could not be deleted. Please retry.");
    } finally {
      setDeleting(false);
    }
  };

  return <>
    <button
      type="button"
      data-testid={`workspace-delete-trigger-${projectId}`}
      onClick={(event) => { event.stopPropagation(); setError(null); setOpen(true); }}
      className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 opacity-0 transition hover:bg-rose-300/10 hover:text-rose-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60 group-hover:opacity-100"
      aria-label={`Delete workspace ${projectName}`}
      title={`Delete ${projectName}`}
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!deleting) { setOpen(nextOpen); if (!nextOpen) setError(null); } }}>
      <DialogContent className="border-rose-300/25 bg-[#16111a] text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete workspace permanently?</DialogTitle>
          <DialogDescription className="text-slate-400">This removes <span className="font-medium text-slate-200">{projectName}</span>, its conversations, Build Runs, artifacts, and workspace files. This cannot be undone.</DialogDescription>
        </DialogHeader>
        {deleting ? <p role="status" aria-live="polite" className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-2 text-xs text-cyan-50">Deleting saved project data safely. This can take a moment for projects with Build Runs and artifacts—keep this window open.</p> : null}
        {error ? <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/[0.08] px-3 py-2 text-xs text-rose-100">{error}</p> : null}
        <DialogFooter>
          <button type="button" disabled={deleting} onClick={() => { setOpen(false); setError(null); }} className="inline-flex h-9 items-center justify-center rounded-lg border border-white/[0.12] px-3 text-xs font-medium text-slate-200 disabled:opacity-50">Cancel</button>
          <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-300 px-3 text-xs font-semibold text-rose-950 transition hover:bg-rose-200 active:scale-[0.97] disabled:opacity-50">{deleting ? "Deleting…" : error ? "Retry deletion" : "Delete permanently"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
