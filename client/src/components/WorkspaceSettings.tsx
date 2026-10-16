import React, { useCallback, useEffect, useState } from "react";
import { Code2, ExternalLink, Github, Globe, KeyRound, Link2, LockKeyhole, Search, Settings2, ShieldCheck, Trash2 } from "lucide-react";

type SettingsSection = "general" | "domains" | "integrations" | "secrets" | "github";
type SecretRecord = { id: number; name: string; provider: string; createdAt: string; updatedAt: string };
type BuildRunInfo = { id: string; contract: { projectName: string }; preview?: { proxyUrl?: string; projectVersion?: number; status?: string; lastUpdatedAt?: string } } | null;
type ProjectSettings = {
  published: { buildRunId: string; publicUrl: string; publishedAt: string; websiteName: string } | null;
};

export function domainPurchaseSearchUrl(provider: "namecheap" | "godaddy", domain: string) {
  const query = domain.trim();
  if (!query) return null;
  const encoded = encodeURIComponent(query);
  return provider === "namecheap"
    ? `https://www.namecheap.com/domains/registration/results/?domain=${encoded}`
    : `https://www.godaddy.com/domainsearch/find?domainToCheck=${encoded}`;
}

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings2 }> = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "secrets", label: "Secrets", icon: KeyRound },
  { id: "github", label: "GitHub", icon: Github },
];

function getInitialSection(): SettingsSection {
  if (typeof window === "undefined") return "general";
  const saved = window.localStorage.getItem("smartbuild:workspace-settings-section");
  return sections.some(section => section.id === saved) ? saved as SettingsSection : "general";
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || `Request failed (${response.status}).`;
}

export function WorkspaceSettings({ projectId, publishRevision, run, focusSecretsRevision = 0 }: {
  projectId: number | null;
  publishRevision: string | null;
  run: BuildRunInfo;
  focusSecretsRevision?: number;
}) {
  const [section, setSection] = useState<SettingsSection>(getInitialSection);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings | null>(null);
  const [loadingProjectSettings, setLoadingProjectSettings] = useState(false);
  const [projectSettingsError, setProjectSettingsError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<SecretRecord[]>([]);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [deletingSecretId, setDeletingSecretId] = useState<number | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretNotice, setSecretNotice] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [domainSearch, setDomainSearch] = useState("");

  const activeSection = sections.find(item => item.id === section) ?? sections[0]!;
  const SectionIcon = activeSection.icon;

  useEffect(() => {
    if (section !== activeSection.id) setSection(activeSection.id);
    window.localStorage.setItem("smartbuild:workspace-settings-section", activeSection.id);
  }, [activeSection.id, section]);

  useEffect(() => {
    if (focusSecretsRevision > 0) setSection("secrets");
  }, [focusSecretsRevision]);

  useEffect(() => {
    if (!projectId || (activeSection.id !== "general" && activeSection.id !== "domains")) {
      setProjectSettings(null);
      setProjectSettingsError(null);
      return;
    }
    const controller = new AbortController();
    setLoadingProjectSettings(true);
    void fetch(`/api/workspace/projects/${projectId}/settings`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await readError(response));
        return await response.json() as ProjectSettings;
      })
      .then(result => {
        setProjectSettings(result);
        setProjectSettingsError(null);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProjectSettingsError(error instanceof Error ? error.message : "Project settings could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingProjectSettings(false);
      });
    return () => controller.abort();
  }, [activeSection.id, projectId, publishRevision]);

  const loadSecrets = useCallback(async (signal: AbortSignal) => {
    if (!projectId) {
      setSecrets([]);
      return;
    }
    setLoadingSecrets(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/secrets`, { credentials: "include", cache: "no-store", signal });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json() as { secrets: SecretRecord[] };
      setSecrets(result.secrets);
      setSecretError(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSecretError(error instanceof Error ? error.message : "Saved API keys could not be loaded.");
    } finally {
      setLoadingSecrets(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (section !== "secrets") return;
    const controller = new AbortController();
    void loadSecrets(controller.signal);
    return () => controller.abort();
  }, [loadSecrets, section]);

  const saveSecret = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId) return;
    setSavingSecret(true);
    setSecretError(null);
    setSecretNotice(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/secrets`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, name, value }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setValue("");
      setProvider("");
      setName("");
      setSecretNotice("API key encrypted and saved. It is not connected to a service yet.");
      const controller = new AbortController();
      await loadSecrets(controller.signal);
    } catch (error) {
      setSecretError(error instanceof Error ? error.message : "The API key could not be saved.");
    } finally {
      setSavingSecret(false);
    }
  };

  const deleteSecret = async (secret: SecretRecord) => {
    if (!projectId || !window.confirm(`Delete ${secret.name}? This cannot be undone.`)) return;
    setDeletingSecretId(secret.id);
    setSecretError(null);
    setSecretNotice(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/secrets/${secret.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      setSecrets(current => current.filter(item => item.id !== secret.id));
      setSecretNotice(`${secret.name} was deleted.`);
    } catch (error) {
      setSecretError(error instanceof Error ? error.message : "The API key could not be deleted.");
    } finally {
      setDeletingSecretId(null);
    }
  };

  const published = projectSettings?.published ?? null;
  const websiteName = published?.websiteName ?? run?.contract.projectName ?? null;

  return (
    <section aria-label="Workspace Settings" className="flex min-h-0 flex-1 bg-[#0b0d12] text-slate-100">
      <nav aria-label="Settings sections" className="w-32 shrink-0 overflow-y-auto border-r border-white/[0.07] bg-[#0b0d12] p-1.5 sm:w-36">
        {sections.map(item => {
          const Icon = item.icon;
          return <button key={item.id} type="button" aria-current={activeSection.id === item.id ? "page" : undefined} onClick={() => setSection(item.id)} className={`mb-0.5 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[10px] transition sm:text-[11px] ${activeSection.id === item.id ? "bg-white/[0.09] text-white" : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"}`}><Icon className="h-3.5 w-3.5 shrink-0" />{item.label}</button>;
        })}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 border-b border-white/[0.07] pb-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><SectionIcon className="h-4 w-4 text-slate-300" />{activeSection.label}</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Settings for the current SmartBuild project.</p>
          </div>

          {activeSection.id === "general" && <div className="space-y-3">
            {projectSettingsError && <p role="alert" className="rounded border border-red-400/20 bg-red-400/[0.05] p-2.5 text-[10px] text-red-200">{projectSettingsError}</p>}
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="truncate text-xs font-semibold">{websiteName ?? (loadingProjectSettings ? "Loading website…" : "No website build selected")}</p>
              {!websiteName && <p className="mt-1 text-[10px] text-slate-500">The website name appears after SmartBuild creates a build for this project.</p>}
            </div>
            <div className="rounded-lg border border-white/[0.08] p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium">Publish &amp; Access</p><p aria-live="polite" className={`rounded-full px-2 py-0.5 text-[9px] ${loadingProjectSettings ? "bg-white/[0.06] text-slate-400" : published ? "bg-emerald-400/10 text-emerald-200" : "bg-white/[0.06] text-slate-400"}`}>{loadingProjectSettings ? "Checking…" : published ? "Published" : "Not published"}</p></div>
              {loadingProjectSettings ? <p className="mt-2 text-[10px] text-slate-500">Loading saved publication status…</p> : published ? <><p className="mt-2 text-[10px] text-slate-400">Public · anyone with the link can access</p><div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-white/[0.035] p-2"><a href={published.publicUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-all text-[10px] text-slate-200 underline">{published.publicUrl}</a><button type="button" onClick={() => void navigator.clipboard?.writeText(published.publicUrl)} className="rounded border border-white/[0.1] px-2 py-1 text-[10px] text-slate-300 hover:bg-white/[0.07]">Copy</button><a href={published.publicUrl} target="_blank" rel="noreferrer" aria-label="Open published website" className="inline-flex items-center gap-1 rounded border border-white/[0.1] px-2 py-1 text-[10px] text-slate-300 hover:bg-white/[0.07]">Open <ExternalLink className="h-3 w-3" /></a></div><p className="mt-2 text-[9px] text-slate-500">Published {new Date(published.publishedAt).toLocaleString()} · Build {published.buildRunId.slice(0, 8)}</p></> : <p className="mt-2 text-[10px] text-slate-400">{projectSettingsError ? "Publication status is unavailable because the saved project settings could not be loaded." : "No verified publication is saved for this project."}</p>}
            </div>
            <div className="rounded-lg border border-white/[0.08] p-3">
              <p className="text-[11px] font-medium">Preview</p>
              {run?.preview?.proxyUrl ? <><p className="mt-1 text-[10px] text-slate-400">{run.preview.status === "ready" ? "Ready" : "Available"}{run.preview.projectVersion ? ` · v${run.preview.projectVersion}` : ""}</p><a href={run.preview.proxyUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-[10px] text-cyan-200 hover:text-white">Open current preview <ExternalLink className="h-3 w-3 shrink-0" /></a></> : <p className="mt-1 text-[10px] text-slate-500">No Preview is available for the selected Build Run.</p>}
            </div>
          </div>}

          {activeSection.id === "domains" && <div className="space-y-3">
            <div className="rounded-lg border border-white/[0.08] p-3">
              <p className="text-[11px] font-medium">Current published link</p>
              {loadingProjectSettings ? <p className="mt-2 text-[10px] text-slate-500">Loading saved publication…</p> : published ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded bg-white/[0.035] p-2"><Globe className="h-3.5 w-3.5 text-slate-400" /><a href={published.publicUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-all text-[10px] text-slate-200 underline">{published.publicUrl}</a><button type="button" onClick={() => void navigator.clipboard?.writeText(published.publicUrl)} className="rounded border border-white/[0.1] px-2 py-1 text-[10px] text-slate-300 hover:bg-white/[0.07]">Copy</button></div> : <p className="mt-2 text-[10px] leading-5 text-slate-500">{projectSettingsError ? "The saved publication could not be loaded." : "No published link is saved for this project yet."}</p>}
            </div>
            <div className="rounded-lg border border-white/[0.08] p-3">
              <p className="text-[11px] font-medium">Buy a domain</p>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">Search with either registrar. Availability, price, and purchase are handled on the registrar’s website; SmartBuild does not buy or connect the domain.</p>
              <label className="mt-3 block text-[10px] text-slate-400">Domain name<input type="text" value={domainSearch} onChange={event => setDomainSearch(event.target.value)} maxLength={253} autoComplete="url" placeholder="example.com" className="mt-1 w-full rounded border border-white/[0.1] bg-black/20 px-2.5 py-2 text-[11px] text-white outline-none focus:border-cyan-300/50" /></label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["namecheap", "godaddy"] as const).map(provider => {
                  const href = domainPurchaseSearchUrl(provider, domainSearch);
                  const label = provider === "namecheap" ? "Search on Namecheap" : "Search on GoDaddy";
                  return <a key={provider} href={href ?? undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!href} onClick={event => { if (!href) event.preventDefault(); }} className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[10px] font-medium transition ${href ? "border-white/[0.12] text-slate-200 hover:bg-white/[0.07]" : "cursor-not-allowed border-white/[0.06] text-slate-600"}`}><Search className="h-3 w-3" />{label}<ExternalLink className="h-3 w-3" /></a>;
                })}
              </div>
            </div>
          </div>}

          {activeSection.id === "integrations" && <div className="rounded-lg border border-white/[0.08] p-3">
            <p className="text-[11px] font-medium">Service connections</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-400">No service integrations are connected. Saving an API key does not implement or activate a provider integration; each service needs its own verified adapter.</p>
            <button type="button" onClick={() => setSection("secrets")} className="mt-3 rounded border border-white/[0.12] px-2.5 py-1.5 text-[10px] text-slate-200 hover:bg-white/[0.06]">Manage API keys</button>
          </div>}

          {activeSection.id === "secrets" && <div className="space-y-3">
            <div className="flex gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[10px] leading-5 text-amber-100/80"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>Keys are encrypted on the server and never returned to this page after saving. Stored keys are not automatically used by a generated site; the relevant provider integration must be implemented first. Do not paste keys into Chat.</p></div>
            {!projectId && <p role="status" className="rounded border border-white/[0.08] p-3 text-[10px] text-slate-400">Select a project before managing its API keys.</p>}
            {projectId && <form onSubmit={saveSecret} className="space-y-2 rounded-lg border border-white/[0.08] p-3">
              <p className="text-[11px] font-medium">Add an API key</p>
              <p className="text-[9px] leading-4 text-slate-500">The server operator must configure PROJECT_SECRETS_ENCRYPTION_KEY before keys can be saved.</p>
              <label className="block text-[10px] text-slate-400">Service name<input value={provider} onChange={event => setProvider(event.target.value)} maxLength={80} required placeholder="For example, Gemini" className="mt-1 w-full rounded border border-white/[0.1] bg-black/20 px-2.5 py-2 text-[11px] text-white outline-none focus:border-cyan-300/50" /></label>
              <label className="block text-[10px] text-slate-400">Key name<input value={name} onChange={event => setName(event.target.value)} maxLength={64} pattern="[A-Za-z][A-Za-z0-9_\x2d]{0,63}" required placeholder="For example, GEMINI_API_KEY" className="mt-1 w-full rounded border border-white/[0.1] bg-black/20 px-2.5 py-2 font-mono text-[11px] text-white outline-none focus:border-cyan-300/50" /></label>
              <label className="block text-[10px] text-slate-400">API key<input type="password" value={value} onChange={event => setValue(event.target.value)} maxLength={10000} autoComplete="new-password" required placeholder="Enter the key from the provider" className="mt-1 w-full rounded border border-white/[0.1] bg-black/20 px-2.5 py-2 font-mono text-[11px] text-white outline-none focus:border-cyan-300/50" /></label>
              <button type="submit" disabled={savingSecret} className="rounded border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1.5 text-[10px] font-medium text-cyan-100 hover:bg-cyan-300/[0.14] disabled:opacity-50">{savingSecret ? "Saving securely…" : "Save encrypted key"}</button>
            </form>}
            {secretError && <p role="alert" className="rounded border border-red-400/20 bg-red-400/[0.05] p-2.5 text-[10px] text-red-200">{secretError}</p>}
            {secretNotice && <p role="status" className="rounded border border-emerald-300/15 bg-emerald-300/[0.04] p-2.5 text-[10px] text-emerald-100">{secretNotice}</p>}
            {projectId && <div className="rounded-lg border border-white/[0.08] p-3">
              <p className="mb-2 text-[11px] font-medium">Saved keys</p>
              {loadingSecrets ? <p className="text-[10px] text-slate-500">Loading saved key names…</p> : secretError && secrets.length === 0 ? null : secrets.length === 0 ? <p className="text-[10px] text-slate-500">No API keys saved for this project.</p> : <ul className="divide-y divide-white/[0.06]">{secrets.map(secret => <li key={secret.id} className="flex items-center gap-2 py-2"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-200" /><div className="min-w-0 flex-1"><p className="truncate font-mono text-[10px] text-slate-200">{secret.name}</p><p className="text-[9px] text-slate-500">{secret.provider} · updated {new Date(secret.updatedAt).toLocaleString()}</p></div><button type="button" aria-label={`Delete ${secret.name}`} disabled={deletingSecretId === secret.id} onClick={() => void deleteSecret(secret)} className="rounded p-1.5 text-slate-500 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button></li>)}</ul>}
            </div>}
          </div>}

          {activeSection.id === "github" && <Unavailable title="GitHub sync is not connected" detail="Repository linking and two-way synchronization are not implemented here. No connection is being simulated." />}
        </div>
      </div>
    </section>
  );
}

function Unavailable({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-lg border border-white/[0.08] p-3"><Code2 className="h-4 w-4 text-slate-500" /><p className="mt-2 text-[11px] font-medium text-slate-300">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{detail}</p></div>;
}
