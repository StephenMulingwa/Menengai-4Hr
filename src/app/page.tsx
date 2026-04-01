"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mode = "excel" | "select";
type Vehicle = { id: number; name: string };

const style = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .m4hr-root {
    font-family: 'Instrument Sans', sans-serif;
    min-height: 100vh;
    background: #0c0c0c;
    color: #e8e2d4;
    position: relative;
    overflow-x: hidden;
  }

  .m4hr-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 50% at 20% -10%, rgba(245,158,11,0.07) 0%, transparent 60%),
      radial-gradient(ellipse 60% 40% at 90% 110%, rgba(16,185,129,0.04) 0%, transparent 50%);
    pointer-events: none;
  }

  .m4hr-grid-bg {
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
  }

  .m4hr-main {
    position: relative;
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }

  /* ── Header ─────────────────────────────────── */
  .m4hr-header {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 48px;
  }

  .m4hr-logo-ring {
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: linear-gradient(135deg, #1a1a14, #2a2518);
    border: 1px solid rgba(245,158,11,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 600;
    color: #f59e0b;
    letter-spacing: -0.5px;
    position: relative;
    overflow: hidden;
  }

  .m4hr-logo-ring::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 30% 30%, rgba(245,158,11,0.15), transparent 60%);
  }

  .m4hr-title {
    font-family: 'Playfair Display', serif;
    font-size: 32px;
    font-weight: 500;
    color: #f0ead6;
    letter-spacing: -0.5px;
    line-height: 1.1;
  }

  .m4hr-subtitle {
    margin-top: 6px;
    font-size: 13px;
    color: #6b6456;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.02em;
  }

  /* ── Section labels ──────────────────────────── */
  .m4hr-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #6b6456;
    margin-bottom: 10px;
  }

  /* ── Date range card ─────────────────────────── */
  .m4hr-card {
    background: #111108;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 12px;
    position: relative;
  }

  .m4hr-card-accent {
    position: absolute;
    top: 0; left: 24px; right: 24px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(245,158,11,0.3), transparent);
  }

  .m4hr-date-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .m4hr-date-field { display: flex; flex-direction: column; gap: 8px; }

  .m4hr-date-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #4a4035;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .m4hr-date-label-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #f59e0b;
    opacity: 0.6;
  }

  .m4hr-input {
    height: 44px;
    background: #0a0a07;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 0 14px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    color: #c8bfa8;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    color-scheme: dark;
    width: 100%;
  }

  .m4hr-input:focus {
    border-color: rgba(245,158,11,0.4);
    box-shadow: 0 0 0 3px rgba(245,158,11,0.06);
  }

  /* ── Mode tabs ───────────────────────────────── */
  .m4hr-tabs {
    display: flex;
    background: #0a0a07;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 4px;
    gap: 4px;
    margin-bottom: 16px;
  }

  .m4hr-tab {
    flex: 1;
    height: 38px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
    font-family: 'Instrument Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
    background: transparent;
    color: #5a5040;
  }

  .m4hr-tab.active {
    background: #1e1a0f;
    color: #f0b929;
    border: 1px solid rgba(245,158,11,0.2);
    box-shadow: 0 1px 6px rgba(0,0,0,0.4);
  }

  .m4hr-tab:not(.active):hover { color: #9a8c78; }

  /* ── File upload ─────────────────────────────── */
  .m4hr-upload-zone {
    border: 1px dashed rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 28px 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    background: #0a0a07;
    position: relative;
  }

  .m4hr-upload-zone:hover, .m4hr-upload-zone.has-file {
    border-color: rgba(245,158,11,0.3);
    background: rgba(245,158,11,0.03);
  }

  .m4hr-upload-zone input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }

  .m4hr-upload-icon {
    width: 36px; height: 36px;
    margin: 0 auto 10px;
    border-radius: 10px;
    background: rgba(245,158,11,0.1);
    border: 1px solid rgba(245,158,11,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .m4hr-upload-text {
    font-size: 13px;
    color: #6b6456;
    line-height: 1.5;
  }

  .m4hr-upload-hint {
    font-size: 11px;
    color: #3a332a;
    margin-top: 4px;
    font-family: 'IBM Plex Mono', monospace;
  }

  .m4hr-file-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(245,158,11,0.1);
    border: 1px solid rgba(245,158,11,0.2);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    font-family: 'IBM Plex Mono', monospace;
    color: #c8a855;
    margin-top: 10px;
  }

  /* ── Vehicle list ────────────────────────────── */
  .m4hr-search {
    height: 44px;
    background: #0a0a07;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 0 14px;
    font-family: 'Instrument Sans', sans-serif;
    font-size: 13px;
    color: #c8bfa8;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    width: 100%;
    margin-bottom: 12px;
  }

  .m4hr-search::placeholder { color: #3a332a; }
  .m4hr-search:focus {
    border-color: rgba(245,158,11,0.4);
    box-shadow: 0 0 0 3px rgba(245,158,11,0.06);
  }

  .m4hr-vehicle-list {
    max-height: 260px;
    overflow-y: auto;
    background: #0a0a07;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    scrollbar-width: thin;
    scrollbar-color: rgba(245,158,11,0.2) transparent;
  }

  .m4hr-vehicle-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    cursor: pointer;
    transition: background 0.15s;
  }

  .m4hr-vehicle-item:last-child { border-bottom: none; }
  .m4hr-vehicle-item:hover { background: rgba(245,158,11,0.04); }
  .m4hr-vehicle-item.checked { background: rgba(245,158,11,0.06); }

  .m4hr-checkbox {
    width: 16px; height: 16px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.15);
    background: transparent;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }

  .m4hr-checkbox.checked {
    background: #f59e0b;
    border-color: #f59e0b;
  }

  .m4hr-checkmark {
    width: 9px; height: 7px;
    display: none;
  }

  .m4hr-checkbox.checked .m4hr-checkmark { display: block; }

  .m4hr-vehicle-name {
    font-size: 13px;
    color: #b8ad98;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.01em;
  }

  .m4hr-vehicle-item.checked .m4hr-vehicle-name { color: #d4c090; }

  .m4hr-list-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .m4hr-ghost-btn {
    height: 34px;
    padding: 0 14px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.07);
    background: transparent;
    color: #6b6456;
    font-size: 12px;
    font-family: 'Instrument Sans', sans-serif;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .m4hr-ghost-btn:hover {
    border-color: rgba(255,255,255,0.14);
    color: #9a8c78;
    background: rgba(255,255,255,0.03);
  }

  .m4hr-count-badge {
    margin-left: auto;
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    color: #f59e0b;
    background: rgba(245,158,11,0.1);
    border: 1px solid rgba(245,158,11,0.2);
    border-radius: 6px;
    padding: 2px 8px;
  }

  /* ── Run button ──────────────────────────────── */
  .m4hr-run-btn {
    width: 100%;
    height: 52px;
    border-radius: 14px;
    border: none;
    cursor: pointer;
    font-family: 'Instrument Sans', sans-serif;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.01em;
    position: relative;
    overflow: hidden;
    transition: transform 0.15s, opacity 0.2s;
    margin-top: 4px;
    background: linear-gradient(135deg, #d97706, #f59e0b 50%, #d97706);
    background-size: 200% 100%;
    color: #1a0f00;
  }

  .m4hr-run-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    background-position: 100% 0;
  }

  .m4hr-run-btn:active:not(:disabled) { transform: translateY(0px) scale(0.99); }
  .m4hr-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .m4hr-run-btn-shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%);
    transform: translateX(-100%);
    animation: shimmer 2s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(100%); }
    100% { transform: translateX(100%); }
  }

  /* ── Spinner ─────────────────────────────────── */
  .m4hr-spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(26,15,0,0.3);
    border-top-color: #1a0f00;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
    vertical-align: middle;
    margin-right: 8px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Alerts ──────────────────────────────────── */
  .m4hr-alert {
    border-radius: 12px;
    padding: 14px 16px;
    font-size: 13px;
    line-height: 1.5;
    margin-top: 12px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .m4hr-alert-error {
    background: rgba(220,38,38,0.07);
    border: 1px solid rgba(220,38,38,0.2);
    color: #f87171;
  }

  .m4hr-alert-warn {
    background: rgba(245,158,11,0.07);
    border: 1px solid rgba(245,158,11,0.2);
    color: #fbbf24;
  }

  .m4hr-alert-success {
    background: rgba(16,185,129,0.07);
    border: 1px solid rgba(16,185,129,0.2);
    color: #34d399;
  }

  .m4hr-alert-icon {
    flex-shrink: 0;
    width: 16px; height: 16px;
    margin-top: 1px;
    font-size: 14px;
  }

  /* ── Download link ───────────────────────────── */
  .m4hr-download-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    font-size: 13px;
    font-weight: 500;
    color: #f59e0b;
    text-decoration: none;
    border-bottom: 1px solid rgba(245,158,11,0.3);
    padding-bottom: 1px;
    transition: color 0.15s, border-color 0.15s;
    font-family: 'IBM Plex Mono', monospace;
  }

  .m4hr-download-link:hover { color: #fcd34d; border-color: rgba(245,158,11,0.6); }

  /* ── Footer ──────────────────────────────────── */
  .m4hr-footer {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid rgba(255,255,255,0.04);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .m4hr-footer-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: #2a231a;
  }

  .m4hr-footer-text {
    font-size: 11px;
    color: #2a231a;
    font-family: 'IBM Plex Mono', monospace;
  }

  .m4hr-footer-key {
    color: #4a3d28;
    background: #0a0a07;
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
  }

  /* ── Loading state ───────────────────────────── */
  .m4hr-loading-row {
    padding: 20px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #3a332a;
    font-size: 13px;
  }

  .m4hr-loading-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #3a332a;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .m4hr-loading-dot:nth-child(2) { animation-delay: 0.2s; }
  .m4hr-loading-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }

  @media (max-width: 520px) {
    .m4hr-date-grid { grid-template-columns: 1fr; }
    .m4hr-title { font-size: 26px; }
  }
`;

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

function nowFilenameStamp() {
  // YYYY-MM-DD_HH-mm-ss (local time)
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(
    d.getMinutes(),
  )}-${pad(d.getSeconds())}`;
}

function filenameFromContentDisposition(cd: string | null) {
  if (!cd) return null;
  const m = /filename\*?=(?:UTF-8''|")?([^\";]+)\"?/i.exec(cd);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<Mode>("excel");
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
    return () => { cancelled = true; };
  }, [vehicleQuery]);

  const filteredVehicles = useMemo(() => {
    const q = vehicleQuery.trim().toUpperCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => v.name.toUpperCase().includes(q));
  }, [vehicleQuery, vehicles]);

  const toggleVehicle = useCallback((name: string) => {
    setSelectedVehicles((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  }, []);

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
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }

      const missing = res.headers.get("X-Missing-Vehicles");
      if (missing) setMissingVehicles(missing);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setLastDownloadUrl(url);

      const downloadName =
        filenameFromContentDisposition(res.headers.get("content-disposition")) ??
        `Menengai_4HR_${nowFilenameStamp()}.xlsx`;

      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a); a.click(); a.remove();

      // Auto-clear inputs after successful run
      setSelectedVehicles([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <style>{style}</style>
      <div className="m4hr-root">
        <div className="m4hr-grid-bg" />
        <main className="m4hr-main">

          {/* Header */}
          <div className="m4hr-header">
            <div className="m4hr-logo-ring">M</div>
            <div>
              <h1 className="m4hr-title">Menengai 4HR</h1>
              <p className="m4hr-subtitle">Wialon → Excel · 4-hour tracking report</p>
            </div>
          </div>

          {/* Date range */}
          <div className="m4hr-card">
            <div className="m4hr-card-accent" />
            <div className="m4hr-label">Report window · EAT</div>
            <div className="m4hr-date-grid">
              <div className="m4hr-date-field">
                <div className="m4hr-date-label">
                  <div className="m4hr-date-label-dot" />
                  Start
                </div>
                <input
                  className="m4hr-input"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="m4hr-date-field">
                <div className="m4hr-date-label">
                  <div className="m4hr-date-label-dot" style={{background:"#6b6456"}} />
                  End
                </div>
                <input
                  className="m4hr-input"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Vehicle source */}
          <div className="m4hr-card">
            <div className="m4hr-card-accent" />
            <div className="m4hr-label">Vehicle source</div>

            <div className="m4hr-tabs">
              <button
                className={`m4hr-tab${mode==="excel"?" active":""}`}
                onClick={() => setMode("excel")}
              >
                Upload Excel
              </button>
              <button
                className={`m4hr-tab${mode==="select"?" active":""}`}
                onClick={() => setMode("select")}
              >
                Select Menengai vehicles
              </button>
            </div>

            {mode === "excel" ? (
              <div>
                <div className={`m4hr-upload-zone${file?" has-file":""}`}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {!file ? (
                    <>
                      <div className="m4hr-upload-icon">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 10V3M8 3L5.5 5.5M8 3L10.5 5.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M2 11v1.5A1.5 1.5 0 003.5 14h9A1.5 1.5 0 0014 12.5V11" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="m4hr-upload-text">Drop your Excel file here or click to browse</div>
                      <div className="m4hr-upload-hint">Requires column: Registration Number</div>
                    </>
                  ) : (
                    <>
                      <div className="m4hr-upload-icon">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8.5l3.5 3.5 6.5-7" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="m4hr-upload-text" style={{color:"#c8a855"}}>File selected</div>
                    </>
                  )}
                </div>
                {file && (
                  <div style={{marginTop:10}}>
                    <span className="m4hr-file-pill">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="1" y="1" width="10" height="10" rx="2" stroke="#f59e0b" strokeWidth="1"/>
                        <path d="M3.5 4.5h5M3.5 6h5M3.5 7.5h3" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round"/>
                      </svg>
                      {file.name}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input
                  className="m4hr-search"
                  value={vehicleQuery}
                  onChange={(e) => setVehicleQuery(e.target.value)}
                  placeholder="Filter vehicles…"
                />

                {selectedVehicles.length > 0 && (
                  <div style={{display:"flex",alignItems:"center",marginBottom:10}}>
                    <span style={{fontSize:12,color:"#4a4035"}}>Selected</span>
                    <span className="m4hr-count-badge">{selectedVehicles.length}</span>
                  </div>
                )}

                <div className="m4hr-vehicle-list">
                  {loadingVehicles ? (
                    <div className="m4hr-loading-row">
                      <div className="m4hr-loading-dot"/>
                      <div className="m4hr-loading-dot"/>
                      <div className="m4hr-loading-dot"/>
                      <span>Loading vehicles</span>
                    </div>
                  ) : filteredVehicles.length ? (
                    filteredVehicles.map((v) => {
                      const checked = selectedVehicles.includes(v.name);
                      return (
                        <div
                          key={v.id}
                          className={`m4hr-vehicle-item${checked?" checked":""}`}
                          onClick={() => toggleVehicle(v.name)}
                        >
                          <div className={`m4hr-checkbox${checked?" checked":""}`}>
                            <svg className="m4hr-checkmark" viewBox="0 0 9 7" fill="none">
                              <path d="M1 3.5L3.5 6L8 1" stroke="#1a0f00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <span className="m4hr-vehicle-name">{v.name}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="m4hr-loading-row" style={{color:"#3a332a"}}>
                      No vehicles found
                    </div>
                  )}
                </div>

                <div className="m4hr-list-actions">
                  <button
                    className="m4hr-ghost-btn"
                    onClick={() => setSelectedVehicles(filteredVehicles.map((v)=>v.name))}
                  >
                    Select all shown
                  </button>
                  <button
                    className="m4hr-ghost-btn"
                    onClick={() => setSelectedVehicles([])}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Run */}
          <div className="m4hr-card">
            <div className="m4hr-card-accent" />
            <button
              className="m4hr-run-btn"
              disabled={running}
              onClick={runReport}
            >
              {running && <div className="m4hr-run-btn-shimmer"/>}
              {running ? (
                <><span className="m4hr-spinner"/>Generating report…</>
              ) : (
                "Run report  →"
              )}
            </button>

            {error && (
              <div className="m4hr-alert m4hr-alert-error">
                <span className="m4hr-alert-icon">✕</span>
                <span>{error}</span>
              </div>
            )}

            {missingVehicles && (
              <div className="m4hr-alert m4hr-alert-warn">
                <span className="m4hr-alert-icon">⚠</span>
                <span>Not found in Wialon: {missingVehicles}</span>
              </div>
            )}

            {lastDownloadUrl && (
              <>
                <div className="m4hr-alert m4hr-alert-success" style={{marginBottom:0}}>
                  <span className="m4hr-alert-icon">✓</span>
                  <span>Report ready — download started automatically.</span>
                </div>
                <a
                  className="m4hr-download-link"
                  href={lastDownloadUrl}
                  download={`Menengai_4HR_${nowFilenameStamp()}.xlsx`}
                >
                  ↓ Download again
                </a>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="m4hr-footer">
            <div className="m4hr-footer-dot"/>
            <span className="m4hr-footer-text">
              Requires <span className="m4hr-footer-key">WIALON_TOKEN</span> in Vercel env
            </span>
          </div>

        </main>
      </div>
    </>
  );
}