"use client";

import { useEffect, useMemo, useState } from "react";

type Vehicle = { id: number; name: string };

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function Home() {
  const [mode, setMode] = useState<"excel" | "select">("excel");
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [end, setEnd] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return toLocalInputValue(d);
  });

  const [file, setFile] = useState<File | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleQuery, setVehicleQuery] = useState("CPO - Menengai");
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingVehicles, setMissingVehicles] = useState<string | null>(null);
  const [lastDownloadUrl, setLastDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingVehicles(true);
      setError(null);
      try {
        const res = await fetch(`/api/vehicles?q=${encodeURIComponent(vehicleQuery)}`);
        const json = (await res.json()) as { vehicles?: Vehicle[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load vehicles");
        if (!cancelled) setVehicles(json.vehicles ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoadingVehicles(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [vehicleQuery]);

  const filteredVehicles = useMemo(() => {
    const q = vehicleQuery.trim().toUpperCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => v.name.toUpperCase().includes(q));
  }, [vehicleQuery, vehicles]);

  async function runReport() {
    setRunning(true);
    setError(null);
    setMissingVehicles(null);
    if (lastDownloadUrl) URL.revokeObjectURL(lastDownloadUrl);
    setLastDownloadUrl(null);

    try {
      const fd = new FormData();
      fd.set("start", start);
      fd.set("end", end);

      if (mode === "excel") {
        if (!file) throw new Error("Upload an Excel file first");
        fd.set("file", file);
      } else {
        if (!selectedVehicles.length) throw new Error("Select at least one vehicle");
        for (const v of selectedVehicles) fd.append("vehicles", v);
      }

      const res = await fetch("/api/report", { method: "POST", body: fd });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }

      const missing = res.headers.get("X-Missing-Vehicles");
      if (missing) setMissingVehicles(missing);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setLastDownloadUrl(url);

      const a = document.createElement("a");
      a.href = url;
      a.download = "Menengai_4HR_Report.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Menengai_4HR</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Run Menengai logistics reports from Wialon using a date/time period, plus either an Excel upload or vehicle
            selection.
          </p>
        </div>

        <div className="mt-8 grid gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Start (EAT)</span>
              <input
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-white/10 dark:bg-black dark:focus:ring-white/20"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">End (EAT)</span>
              <input
                className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-white/10 dark:bg-black dark:focus:ring-white/20"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("excel")}
                className={`h-10 rounded-xl px-4 text-sm font-medium ${
                  mode === "excel"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                    : "border border-zinc-200 bg-white text-zinc-900 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                }`}
              >
                Upload Excel
              </button>
              <button
                type="button"
                onClick={() => setMode("select")}
                className={`h-10 rounded-xl px-4 text-sm font-medium ${
                  mode === "select"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                    : "border border-zinc-200 bg-white text-zinc-900 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                }`}
              >
                Select Menengai vehicles
              </button>
            </div>

            {mode === "excel" ? (
              <div className="grid gap-2">
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Excel should contain a column named <span className="font-medium">Registration Number</span>.
                </div>
                <input
                  className="block w-full text-sm"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">Selected: {file.name}</div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">Filter</span>
                    <input
                      className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-white/10 dark:bg-black dark:focus:ring-white/20"
                      value={vehicleQuery}
                      onChange={(e) => setVehicleQuery(e.target.value)}
                      placeholder="e.g. CPO - Menengai"
                    />
                  </label>
                  <div className="grid gap-2">
                    <span className="text-sm font-medium">Selected</span>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      {selectedVehicles.length} vehicle(s)
                    </div>
                  </div>
                </div>

                <div className="max-h-72 overflow-auto rounded-xl border border-zinc-200 dark:border-white/10">
                  {loadingVehicles ? (
                    <div className="p-4 text-sm text-zinc-600 dark:text-zinc-400">Loading vehicles…</div>
                  ) : filteredVehicles.length ? (
                    <ul className="divide-y divide-zinc-200 dark:divide-white/10">
                      {filteredVehicles.map((v) => {
                        const checked = selectedVehicles.includes(v.name);
                        return (
                          <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setSelectedVehicles((prev) => {
                                  if (e.target.checked) return Array.from(new Set([...prev, v.name]));
                                  return prev.filter((x) => x !== v.name);
                                });
                              }}
                            />
                            <span className="text-sm">{v.name}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="p-4 text-sm text-zinc-600 dark:text-zinc-400">No vehicles found.</div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium dark:border-white/10 dark:bg-black"
                    onClick={() => setSelectedVehicles(filteredVehicles.map((v) => v.name))}
                  >
                    Select all shown
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium dark:border-white/10 dark:bg-black"
                    onClick={() => setSelectedVehicles([])}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              disabled={running}
              onClick={runReport}
              className="h-12 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {running ? "Running…" : "Run report"}
            </button>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : null}

            {missingVehicles ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
                Missing (not found in Wialon): {missingVehicles}
              </div>
            ) : null}

            {lastDownloadUrl ? (
              <a
                className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
                href={lastDownloadUrl}
                download="Menengai_4HR_Report.xlsx"
              >
                Download again
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
          Backend expects <span className="font-medium">WIALON_TOKEN</span> set in Vercel environment variables.
        </div>
      </main>
    </div>
  );
}
