import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const WIALON_URL = "https://hst-api.wialon.com/wialon/ajax.html";

type WialonLoginResponse = { eid?: string; error?: number };
type ExecReportResponse = {
  error?: number;
  reportResult?: { tables?: Array<{ header?: string[]; rows?: number }> };
};
type ResultRow = { c?: Array<{ t?: string } | string> };
type ReportTableMeta = { header?: string[]; rows?: number };

function normName(s: string) {
  return String(s ?? "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

function parseWialonUtcToEatString(val: string) {
  // Wialon uses dd.mm.YYYY HH:MM:SS in UTC. Convert to EAT (UTC+3) and keep same format.
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(val.trim());
  if (!m) return val;
  const [, dd, mm, yyyy, HH, MM, SS] = m;
  const utcMs = Date.UTC(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(HH),
    Number(MM),
    Number(SS),
  );
  const eatMs = utcMs + 3 * 60 * 60 * 1000;
  const d = new Date(eatMs);

  const pad = (n: number) => String(n).padStart(2, "0");
  const out = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return out;
}

function convertTimestampColumnsToEat<T extends Record<string, unknown>>(
  rows: T[],
  cols: string[],
) {
  return rows.map((r) => {
    const out = { ...r } as Record<string, unknown>;
    for (const col of cols) {
      const v = out[col];
      if (typeof v === "string" && v && v !== "----" && v !== "-----") {
        out[col] = parseWialonUtcToEatString(v);
      }
    }
    return out as T;
  });
}

function parseDdMmYyyyHhMmSsEatToEpochMs(val: string) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(val.trim());
  if (!m) return Number.NaN;
  const [, dd, mm, yyyy, HH, MM, SS] = m;
  // Interpret the string as EAT (UTC+3) then convert to UTC epoch ms by subtracting 3h.
  const utcMs = Date.UTC(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(HH) - 3,
    Number(MM),
    Number(SS),
  );
  return utcMs;
}

function formatDurationFromMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const rem = totalSeconds % 86400;
  const h = Math.floor(rem / 3600);
  const m = Math.floor((rem % 3600) / 60);
  const s = rem % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const hhmmss = `${h}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days} days ${hhmmss}` : hhmmss;
}

function formatNowForFilenameEat() {
  // Format: YYYY-MM-DD_HH-mm-ss in EAT (UTC+3)
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const HH = pad(d.getUTCHours());
  const MM = pad(d.getUTCMinutes());
  const SS = pad(d.getUTCSeconds());
  return `${yyyy}-${mm}-${dd}_${HH}-${MM}-${SS}`;
}

async function wialonLogin(token: string) {
  const body = new URLSearchParams({
    svc: "token/login",
    params: JSON.stringify({ token }),
  });
  const res = await fetch(WIALON_URL, { method: "POST", body });
  const json = (await res.json()) as WialonLoginResponse;
  if (!json.eid) throw new Error(`Wialon login failed (error=${json.error ?? "unknown"})`);
  return json.eid;
}

async function wialonExecReport(eid: string, resourceId: number, templateId: number, unitId: number, from: number, to: number) {
  const body = new URLSearchParams({
    svc: "report/exec_report",
    params: JSON.stringify({
      reportResourceId: resourceId,
      reportTemplateId: templateId,
      reportObjectId: unitId,
      reportObjectSecId: 0,
      interval: { flags: 0, from, to },
    }),
    sid: eid,
  });
  const res = await fetch(WIALON_URL, { method: "POST", body });
  const json = (await res.json()) as ExecReportResponse;
  if (json.error) throw new Error(`Wialon exec_report failed (error=${json.error})`);
  return json;
}

async function wialonGetResultRows(eid: string, tableIndex: number, indexFrom: number, indexTo: number) {
  const body = new URLSearchParams({
    svc: "report/get_result_rows",
    params: JSON.stringify({ tableIndex, indexFrom, indexTo }),
    sid: eid,
  });
  const res = await fetch(WIALON_URL, { method: "POST", body });
  return (await res.json()) as ResultRow[];
}

async function wialonGetResultSubrows(eid: string, tableIndex: number, rowIndex: number) {
  const body = new URLSearchParams({
    svc: "report/get_result_subrows",
    params: JSON.stringify({ tableIndex, rowIndex }),
    sid: eid,
  });
  const res = await fetch(WIALON_URL, { method: "POST", body });
  return (await res.json()) as ResultRow[];
}

async function fetchTableAsObjects(eid: string, tables: ReportTableMeta[] | undefined, tableIndex: number) {
  const meta = tables?.[tableIndex];
  const headers = meta?.header ?? [];
  const rowCount = meta?.rows ?? 0;
  if (!meta || !headers.length || rowCount <= 0) return [];

  const rowsJson = await wialonGetResultRows(eid, tableIndex, 0, Math.max(rowCount - 1, 0));
  const out: Array<Record<string, string>> = [];
  for (const row of rowsJson ?? []) {
    const cells = row?.c ?? [];
    const values = cells.map((c) => (typeof c === "string" ? c : c?.t ?? ""));
    const obj: Record<string, string> = {};
    for (let i = 0; i < Math.min(headers.length, values.length); i++) {
      obj[headers[i]] = String(values[i] ?? "");
    }
    out.push(obj);
  }
  return out;
}

function excelToVehicleNames(fileBytes: ArrayBuffer) {
  const wb = XLSX.read(fileBytes, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  // Prefer exact column name used in the notebook.
  const col = "Registration Number";
  const list = rows
    .map((r) => String((r as Record<string, unknown>)[col] ?? "").trim())
    .filter(Boolean);

  if (list.length) return list;

  // Fallback: first non-empty column in sheet.
  const firstRow = rows[0] ?? {};
  const keys = Object.keys(firstRow);
  for (const k of keys) {
    const v = rows.map((r) => String((r as Record<string, unknown>)[k] ?? "").trim()).filter(Boolean);
    if (v.length) return v;
  }
  return [];
}

function toEpochSecondsEat(isoLike: string) {
  // Accepts 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm'. Interprets as Africa/Nairobi (EAT, UTC+3).
  const s = isoLike.trim();
  if (!s) throw new Error("Missing date/time");
  const [datePart, timePart] = s.split("T");
  const [y, m, d] = datePart.split("-").map((x) => Number(x));
  if (!y || !m || !d) throw new Error(`Invalid date: ${isoLike}`);
  const [hh, mm] = (timePart ? timePart : "00:00").split(":").map((x) => Number(x));
  const utcMs = Date.UTC(y, m - 1, d, (hh ?? 0) - 3, mm ?? 0, 0); // subtract 3h to get UTC
  return Math.floor(utcMs / 1000);
}

export async function POST(req: Request) {
  try {
    const token = process.env.WIALON_TOKEN;
    if (!token) return NextResponse.json({ error: "Missing WIALON_TOKEN env var" }, { status: 500 });

    const form = await req.formData();
    const start = String(form.get("start") ?? "");
    const end = String(form.get("end") ?? "");

    const fromTs = toEpochSecondsEat(start);
    const toTs = toEpochSecondsEat(end);
    if (toTs < fromTs) throw new Error("End must be after start");

    const file = form.get("file");
    const vehiclesRaw = form.getAll("vehicles").map((v) => String(v)).filter(Boolean);

    let vehicleNames: string[] = [];
    if (file && typeof file !== "string") {
      const bytes = await (file as File).arrayBuffer();
      vehicleNames = excelToVehicleNames(bytes);
    } else if (vehiclesRaw.length) {
      vehicleNames = vehiclesRaw;
    } else {
      throw new Error("Provide an Excel file or select at least one vehicle");
    }

    const eid = await wialonLogin(token);

    // Build name -> unit_id mapping from Wialon itself (no local JSON needed).
    const searchBody = new URLSearchParams({
      svc: "core/search_items",
      params: JSON.stringify({
        spec: { itemsType: "avl_unit", propName: "sys_name", propValueMask: "*", sortType: "sys_name" },
        force: 1,
        flags: 1,
        from: 0,
        to: 0xffffffff,
      }),
      sid: eid,
    });
    const unitsRes = await fetch(WIALON_URL, { method: "POST", body: searchBody });
    const unitsJson = (await unitsRes.json()) as { items?: Array<{ id: number; nm?: string }>; error?: number };
    if (unitsJson.error) throw new Error(`Wialon search_items failed (error=${unitsJson.error})`);
    const units = unitsJson.items ?? [];

    const nameToId = new Map<string, number>();
    for (const u of units) {
      if (u.id && u.nm) nameToId.set(normName(u.nm), u.id);
    }

    const selectedUnitIds: Array<{ unitId: number; name: string }> = [];
    const missing: string[] = [];
    for (const name of vehicleNames) {
      const uid = nameToId.get(normName(name));
      if (!uid) missing.push(name);
      else selectedUnitIds.push({ unitId: uid, name });
    }
    const unique = Array.from(
      new Map(selectedUnitIds.map((x) => [x.unitId, x] as const)).values(),
    );
    if (!unique.length) throw new Error(`No vehicles matched in Wialon. Missing: ${missing.slice(0, 10).join(", ")}`);

    const REPORT_RESOURCE_ID = 25601229;
    const TEMPLATE_26 = 26;
    const TEMPLATE_29 = 29; // notebook uses this for detailization table 0

    const locByUnit = new Map<number, Record<string, string>>();
    const mileageByUnit = new Map<number, Record<string, string>>();

    // Yard geofence (from template 26, table 2 detailization)
    const yardCandidates: Array<Record<string, string | number>> = [];

    // Main detailization rows used to build the first columns of new_df (from template 29, table 0 detailization)
    const detailCandidates: Array<Record<string, string | number>> = [];

    for (const { unitId, name } of unique) {
      // ---- Template 26: location + mileage + yard geofence detailization (table 2)
      const exec26 = await wialonExecReport(eid, REPORT_RESOURCE_ID, TEMPLATE_26, unitId, fromTs, toTs);
      const tables26 = exec26.reportResult?.tables ?? [];

      const loc = await fetchTableAsObjects(eid, tables26, 0);
      const loc0 = loc[0] ?? {};
      const grouping = String(loc0["Grouping"] ?? name);
      locByUnit.set(unitId, {
        Grouping: grouping,
        Location: String(loc0["Location"] ?? ""),
        // Always convert to EAT (UTC+3) like the notebook
        "Last message time": parseWialonUtcToEatString(String(loc0["Last message time"] ?? "")),
      });

      const mileage = await fetchTableAsObjects(eid, tables26, 1);
      const mileage0 = mileage[0] ?? {};
      mileageByUnit.set(unitId, {
        Grouping: String(mileage0["Grouping"] ?? grouping),
        "Mileage in trips": String(mileage0["Mileage in trips"] ?? ""),
      });

      const parentGeo = await fetchTableAsObjects(eid, tables26, 2);
      for (let rowIndex = 0; rowIndex < parentGeo.length; rowIndex++) {
        const sub = await wialonGetResultSubrows(eid, 2, rowIndex);
        for (const row of sub ?? []) {
          const cells = row?.c ?? [];
          const values = cells.map((c) => (typeof c === "string" ? c : c?.t ?? ""));
          yardCandidates.push({
            Grouping: String(values[0] ?? grouping),
            Geofence: String(values[1] ?? ""),
            "Time in": String(values[2] ?? ""),
            "Time out": String(values[3] ?? ""),
            "Duration in": String(values[4] ?? ""),
            unit_id: unitId,
          });
        }
      }

      // ---- Template 29: detailization (table 0 subrows) used as the base of new_df
      const exec29 = await wialonExecReport(eid, REPORT_RESOURCE_ID, TEMPLATE_29, unitId, fromTs, toTs);
      const tables29 = exec29.reportResult?.tables ?? [];
      const parent29 = await fetchTableAsObjects(eid, tables29, 0);
      for (let rowIndex = 0; rowIndex < parent29.length; rowIndex++) {
        const sub = await wialonGetResultSubrows(eid, 0, rowIndex);
        for (const row of sub ?? []) {
          const cells = row?.c ?? [];
          const values = cells.map((c) => (typeof c === "string" ? c : c?.t ?? ""));
          // Notebook expects: [Grouping, Geofence, Time in, Time out, Duration in]
          detailCandidates.push({
            Grouping: String(values[0] ?? grouping),
            Geofence: String(values[1] ?? ""),
            "Time in": String(values[2] ?? ""),
            "Time out": String(values[3] ?? ""),
            "Duration in": String(values[4] ?? ""),
            unit_id: unitId,
          });
        }
      }
    }

    // Convert timestamp columns like the notebook.
    const mileageOut = Array.from(mileageByUnit.entries()).map(([unit_id, v]) => ({ ...v, unit_id }));
    const yardOut = convertTimestampColumnsToEat(yardCandidates, ["Time in", "Time out"]);
    const detailOut = convertTimestampColumnsToEat(detailCandidates, ["Time in", "Time out"]);

    // 4HR mileage (now - 4h to now), merged by unit_id.
    // Epoch seconds are timezone-independent. This matches the notebook's:
    // `now_eat = datetime.now(EAT); int(now_eat.timestamp())`
    const to4 = Math.floor(Date.now() / 1000);
    const from4 = to4 - 4 * 60 * 60;

    const mileage4ByUnit = new Map<number, string>();
    for (const { unitId } of unique) {
      const exec4 = await wialonExecReport(eid, REPORT_RESOURCE_ID, TEMPLATE_26, unitId, from4, to4);
      const tables4 = exec4.reportResult?.tables ?? [];
      const m4 = await fetchTableAsObjects(eid, tables4, 1);
      const first = m4[0];
      const value = first?.["Mileage in trips"];
      if (typeof value === "string") mileage4ByUnit.set(unitId, value);
    }

    // ---- Merge duplicated detail rows like the notebook:
    // group by (unit_id, Geofence, Grouping), Time in=min, Time out=max, Duration in = Time out - Time in
    const mergedDetailMap = new Map<
      string,
      {
        unit_id: number;
        Grouping: string;
        Geofence: string;
        minIn: string;
        maxOut: string;
      }
    >();

    for (const r of detailOut) {
      const uid = Number(r.unit_id);
      if (!Number.isFinite(uid)) continue;
      const grouping = String(r.Grouping ?? "");
      const geofence = String(r.Geofence ?? "");
      const timeIn = String(r["Time in"] ?? "");
      const timeOut = String(r["Time out"] ?? "");
      const key = `${uid}::${geofence}::${grouping}`;

      const currInMs = parseDdMmYyyyHhMmSsEatToEpochMs(timeIn);
      const currOutMs = parseDdMmYyyyHhMmSsEatToEpochMs(timeOut);

      const prev = mergedDetailMap.get(key);
      if (!prev) {
        mergedDetailMap.set(key, {
          unit_id: uid,
          Grouping: grouping,
          Geofence: geofence,
          minIn: timeIn,
          maxOut: timeOut,
        });
        continue;
      }

      const prevInMs = parseDdMmYyyyHhMmSsEatToEpochMs(prev.minIn);
      const prevOutMs = parseDdMmYyyyHhMmSsEatToEpochMs(prev.maxOut);

      if (Number.isFinite(currInMs) && (!Number.isFinite(prevInMs) || currInMs < prevInMs)) {
        prev.minIn = timeIn;
      }
      if (Number.isFinite(currOutMs) && (!Number.isFinite(prevOutMs) || currOutMs > prevOutMs)) {
        prev.maxOut = timeOut;
      }
      mergedDetailMap.set(key, prev);
    }

    const mergedDetailRows = Array.from(mergedDetailMap.values()).map((x) => {
      const inMs = parseDdMmYyyyHhMmSsEatToEpochMs(x.minIn);
      const outMs = parseDdMmYyyyHhMmSsEatToEpochMs(x.maxOut);
      const dur = Number.isFinite(inMs) && Number.isFinite(outMs) ? formatDurationFromMs(outMs - inMs) : "";
      return {
        unit_id: x.unit_id,
        Grouping: x.Grouping,
        Geofence: x.Geofence,
        "Time in": x.minIn,
        "Time out": x.maxOut,
        "Duration in": dur,
      };
    });

    // Pick the earliest Time in per unit for the single Tracking row (matches the notebook's resulting 1 row per vehicle).
    const detailBestByUnit = new Map<number, Record<string, string>>();
    for (const r of mergedDetailRows) {
      const uid = Number(r.unit_id);
      if (!Number.isFinite(uid)) continue;
      const timeIn = String(r["Time in"] ?? "");
      const t = parseDdMmYyyyHhMmSsEatToEpochMs(timeIn);
      const prev = detailBestByUnit.get(uid);
      if (!prev) {
        detailBestByUnit.set(uid, {
          Grouping: String(r.Grouping ?? ""),
          Geofence: String(r.Geofence ?? ""),
          "Time in": timeIn,
          "Time out": String(r["Time out"] ?? ""),
          "Duration in": String(r["Duration in"] ?? ""),
        });
        continue;
      }
      const prevT = parseDdMmYyyyHhMmSsEatToEpochMs(String(prev["Time in"] ?? ""));
      if (Number.isFinite(t) && (!Number.isFinite(prevT) || t < prevT)) {
        detailBestByUnit.set(uid, {
          Grouping: String(r.Grouping ?? ""),
          Geofence: String(r.Geofence ?? ""),
          "Time in": timeIn,
          "Time out": String(r["Time out"] ?? ""),
          "Duration in": String(r["Duration in"] ?? ""),
        });
      }
    }

    // Yard dedup: keep first per (unit_id, Geofence) by Time in, then pick yard row per unit (first available)
    const yardBestByUnit = new Map<number, { yardGeofence: string; yardTimeIn: string; status: string }>();
    const yardSorted = [...yardOut].sort((a, b) => {
      const ta = parseDdMmYyyyHhMmSsEatToEpochMs(String(a["Time in"] ?? ""));
      const tb = parseDdMmYyyyHhMmSsEatToEpochMs(String(b["Time in"] ?? ""));
      if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      return ta - tb;
    });
    const seenUnitGeo = new Set<string>();
    for (const r of yardSorted) {
      const uid = Number(r.unit_id);
      if (!Number.isFinite(uid)) continue;
      const geofence = String(r.Geofence ?? "");
      const key = `${uid}::${geofence}`;
      if (seenUnitGeo.has(key)) continue;
      seenUnitGeo.add(key);

      if (!yardBestByUnit.has(uid)) {
        const timeIn = String(r["Time in"] ?? "");
        const status =
          !timeIn || timeIn === "----" || timeIn === "-----" || timeIn === "None" ? "Incomplete" : "Completed";
        yardBestByUnit.set(uid, {
          yardGeofence: geofence,
          yardTimeIn: timeIn,
          status,
        });
      }
    }

    const trackingRows: Array<Record<string, string>> = [];
    for (const { unitId } of unique) {
      const detail = detailBestByUnit.get(unitId) ?? {
        Grouping: locByUnit.get(unitId)?.Grouping ?? "",
        Geofence: "",
        "Time in": "",
        "Time out": "",
        "Duration in": "",
      };
      const loc = locByUnit.get(unitId) ?? { Grouping: detail.Grouping ?? "", Location: "", "Last message time": "" };
      const mileage = mileageByUnit.get(unitId) ?? { "Mileage in trips": "" };
      const yard = yardBestByUnit.get(unitId);

      trackingRows.push({
        Grouping: String(detail.Grouping ?? loc.Grouping ?? ""),
        Geofence: String(detail.Geofence ?? ""),
        "Time in": String(detail["Time in"] ?? ""),
        "Time out": String(detail["Time out"] ?? ""),
        "Duration in": String(detail["Duration in"] ?? ""),
        Location: String(loc.Location ?? ""),
        "Last message time": String(loc["Last message time"] ?? ""),
        "Mileage 4HRs": mileage4ByUnit.get(unitId) ?? "",
        "Mileage in trips": String(mileage["Mileage in trips"] ?? ""),
        "Yard Geofence": yard?.yardGeofence ?? "",
        "Yard Time in": yard?.yardTimeIn ?? "",
        Status: yard?.status ?? "Incomplete",
      });
    }

    // Ensure exact column order requested
    const columns = [
      "Grouping",
      "Geofence",
      "Time in",
      "Time out",
      "Duration in",
      "Location",
      "Last message time",
      "Mileage 4HRs",
      "Mileage in trips",
      "Yard Geofence",
      "Yard Time in",
      "Status",
    ] as const;
    const trackingOrdered = trackingRows.map((r) => {
      const o: Record<string, string> = {};
      for (const c of columns) o[c] = r[c] ?? "";
      return o;
    });

    // Build Excel (single output table = new_df)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trackingOrdered), "Tracking");

    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
    const filename = `Menengai_4HR_${formatNowForFilenameEat()}.xlsx`;

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Missing-Vehicles": missing.slice(0, 50).join(" | "),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 },
    );
  }
}

