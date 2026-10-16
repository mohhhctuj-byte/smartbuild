import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Database, RefreshCw, Table2 } from "lucide-react";

type DatabaseTable = { name: string; columns: string[]; rowCount: number };
type TablesResponse = { buildRunId: string; available: boolean; database?: string; tables: DatabaseTable[]; error?: string };
type RowsResponse = { buildRunId: string; table: string; columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; page: number; pageSize: number; error?: string };
type DatabaseRun = { id: string; contract: { projectName: string } } | null;

export function formatDatabaseCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function DatabaseExplorer({ run }: { run: DatabaseRun }) {
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<RowsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableReloadRevision, setTableReloadRevision] = useState(0);

  const loadTables = useCallback(async (signal?: AbortSignal) => {
    if (!run) {
      setTables([]);
      setSelectedTable(null);
      setAvailable(null);
      setTableData(null);
      return;
    }
    setLoadingTables(true);
    try {
      const response = await fetch(`/api/build-runs/${encodeURIComponent(run.id)}/database`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      const body = await response.json() as TablesResponse;
      if (!response.ok) throw new Error(body.error || `Database request failed (${response.status}).`);
      if (body.buildRunId !== run.id) throw new Error("Database response does not match the current Build Run.");
      setAvailable(body.available);
      setTables(body.tables);
      setSelectedTable(current => body.tables.some(table => table.name === current) ? current : body.tables[0]?.name ?? null);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "The project database could not be loaded.");
      setAvailable(false);
      setTables([]);
      setSelectedTable(null);
      setTableData(null);
    } finally {
      setLoadingTables(false);
    }
  }, [run?.id]);

  useEffect(() => {
    const controller = new AbortController();
    setTables([]);
    setSelectedTable(null);
    setTableData(null);
    setAvailable(null);
    setPage(1);
    setError(null);
    void loadTables(controller.signal);
    return () => controller.abort();
  }, [loadTables]);

  useEffect(() => {
    if (!run || !selectedTable) {
      setTableData(null);
      return;
    }
    const controller = new AbortController();
    setLoadingRows(true);
    void fetch(`/api/build-runs/${encodeURIComponent(run.id)}/database/tables/${encodeURIComponent(selectedTable)}?page=${page}&pageSize=50`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    }).then(async response => {
      const body = await response.json() as RowsResponse;
      if (!response.ok) throw new Error(body.error || `Database table request failed (${response.status}).`);
      if (body.buildRunId !== run.id || body.table !== selectedTable || body.page !== page) return;
      setTableData(body);
      setVisibleColumns(current => {
        const columns = current.filter(column => body.columns.includes(column));
        return columns.length ? columns : body.columns;
      });
      setError(null);
    }).catch(cause => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Database rows could not be loaded.");
      setTableData(null);
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingRows(false);
    });
    return () => controller.abort();
  }, [run?.id, selectedTable, page, tableReloadRevision]);

  const selected = useMemo(() => tables.find(table => table.name === selectedTable) || null, [tables, selectedTable]);
  const columnCount = tableData?.columns.length ?? 0;
  const totalPages = Math.max(1, Math.ceil((tableData?.rowCount ?? selected?.rowCount ?? 0) / 50));
  const refresh = () => {
    setTableReloadRevision(revision => revision + 1);
    void loadTables();
  };
  const changePage = (nextPage: number) => {
    setTableData(null);
    setPage(nextPage);
  };
  const chooseTable = (tableName: string) => {
    setTableData(null);
    setSelectedTable(tableName);
    setPage(1);
  };

  return <section aria-label="Project database" className="flex min-h-0 flex-1 overflow-hidden bg-[#0b0d12] text-slate-200">
    <nav aria-label="Database tables" className="flex w-40 shrink-0 flex-col border-r border-white/[0.08] bg-[#0d0f13] sm:w-48">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-3">
        <Database className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="truncate text-xs font-semibold text-slate-200">Database</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!run && <p className="px-2 py-3 text-[10px] leading-4 text-slate-500">Build a project to inspect its database.</p>}
        {run && loadingTables && tables.length === 0 && <p className="px-2 py-3 text-[10px] text-slate-500">Loading tables…</p>}
        {run && !loadingTables && available === false && !error && <p className="px-2 py-3 text-[10px] leading-4 text-slate-500">This project has no database yet.</p>}
        {tables.map(table => <button key={table.name} type="button" onClick={() => chooseTable(table.name)} className={`mb-1 flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-[10px] ${selectedTable === table.name ? "bg-white/[0.08] text-slate-100" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"}`}>
          <span className="flex min-w-0 items-center gap-2"><Table2 className="h-3 w-3 shrink-0 text-slate-500" /><span className="truncate">{table.name}</span></span>
          <span className="shrink-0 tabular-nums text-slate-600">{table.rowCount.toLocaleString()}</span>
        </button>)}
      </div>
    </nav>

    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
        <div className="min-w-0"><h2 className="truncate text-xs font-semibold text-slate-100">{run?.contract.projectName || "Project database"}</h2><p className="text-[9px] text-slate-500">{selected ? `${selected.name} · ${selected.rowCount.toLocaleString()} rows` : "Project data"}</p></div>
        <div className="flex shrink-0 items-center gap-1.5">
          {columnCount > 0 && <div className="relative">
            <button type="button" onClick={() => setColumnsOpen(open => !open)} aria-expanded={columnsOpen} className="rounded-md border border-white/[0.1] px-2 py-1.5 text-[9px] text-slate-300 hover:bg-white/[0.05]">Columns</button>
            {columnsOpen && <div className="absolute right-0 top-9 z-20 max-h-64 min-w-36 overflow-auto rounded-lg border border-white/[0.1] bg-[#181a1f] p-2 shadow-xl">{tableData?.columns.map(column => <label key={column} className="flex items-center gap-2 px-1 py-1.5 text-[9px] text-slate-300"><input type="checkbox" checked={visibleColumns.includes(column)} onChange={event => setVisibleColumns(current => event.target.checked ? [...current, column] : current.filter(item => item !== column))} />{column}</label>)}</div>}
          </div>}
          <button type="button" onClick={refresh} disabled={!run || loadingTables} className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] px-2 py-1.5 text-[9px] text-slate-300 hover:bg-white/[0.05] disabled:opacity-50"><RefreshCw className={`h-3 w-3 ${loadingTables ? "animate-spin" : ""}`} />Refresh</button>
        </div>
      </header>

      {error && <div role="alert" className="m-3 rounded-md border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-[10px] text-rose-100">{error}</div>}
      {!run && <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[10px] text-slate-500">Create or select a project build to see its database.</div>}
      {run && available === false && !error && !loadingTables && <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center"><div><Database className="mx-auto mb-3 h-7 w-7 text-slate-600" /><p className="text-xs font-medium text-slate-300">No project database</p><p className="mt-1 max-w-xs text-[10px] leading-4 text-slate-500">This build does not define persistent data yet. Tables and records will appear when the project has a real database schema.</p></div></div>}
      {run && available !== false && !selected && !loadingTables && !error && <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[10px] text-slate-500">No database tables are defined for this build.</div>}
      {selected && <div className="min-h-0 flex-1 overflow-auto" style={{ scrollbarGutter: "stable", scrollbarColor: "#64748b #0b0d12" }}>
        <table className="min-w-full border-collapse text-left text-[10px]">
          <thead className="sticky top-0 z-10 bg-[#17191e] text-slate-400"><tr><th className="w-10 border-b border-white/[0.08] px-2 py-2 text-right font-medium">#</th>{visibleColumns.map(column => <th key={column} className="max-w-64 border-b border-white/[0.08] px-3 py-2 font-medium">{column}</th>)}</tr></thead>
          <tbody>
            {loadingRows && !tableData && <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-500">Loading rows…</td></tr>}
            {!loadingRows && tableData?.rows.length === 0 && <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-500">No rows in this table yet.</td></tr>}
            {tableData?.rows.map((row, index) => <tr key={`${selectedTable}:${String(row.id ?? index)}`} className="border-b border-white/[0.05] hover:bg-white/[0.025]">
              <td className="px-2 py-2 text-right tabular-nums text-slate-600">{(page - 1) * 50 + index + 1}</td>
              {visibleColumns.map(column => <td key={column} className="max-w-64 truncate px-3 py-2 text-slate-300" title={formatDatabaseCell(row[column])}>{formatDatabaseCell(row[column])}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>}
      {selected && <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.08] px-3 py-2 text-[9px] text-slate-500">
        <span>{(tableData?.rowCount ?? selected.rowCount).toLocaleString()} rows · Rows per page: 50</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" onClick={() => changePage(Math.max(1, page - 1))} disabled={page <= 1 || loadingRows} className="rounded p-1 hover:bg-white/[0.06] disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="tabular-nums">{page} / {totalPages}</span>
          <button type="button" aria-label="Next page" onClick={() => changePage(Math.min(totalPages, page + 1))} disabled={page >= totalPages || loadingRows} className="rounded p-1 hover:bg-white/[0.06] disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </footer>}
    </div>
  </section>;
}
