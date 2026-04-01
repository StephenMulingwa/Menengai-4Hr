import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const WIALON_URL = "https://hst-api.wialon.com/wialon/ajax.html";

type WialonLoginResponse = { eid?: string; error?: number };
type ExecReportResponse = {
  error?: number;
  reportResult?: { tables?: Array<{ header?: string[]; rows?: number }> };
};
type ResultRow = { c?: Array<{ t?: string } | string> };

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

async function fetchTableAsObjects(eid: string, tables: ExecReportResponse["reportResult"]["tables"], tableIndex: number) {
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

    const locRows: Array<Record<string, string | number>> = [];
    const mileageRows: Array<Record<string, string | number>> = [];
    const geofenceRows: Array<Record<string, string | number>> = [];

    for (const { unitId, name } of unique) {
      const exec = await wialonExecReport(eid, REPORT_RESOURCE_ID, TEMPLATE_26, unitId, fromTs, toTs);
      const tables = exec.reportResult?.tables ?? [];

      const loc = await fetchTableAsObjects(eid, tables, 0);
      for (const r of loc) locRows.push({ ...r, unit_id: unitId, Grouping: r["Grouping"] ?? name });

      const mileage = await fetchTableAsObjects(eid, tables, 1);
      for (const r of mileage) mileageRows.push({ ...r, unit_id: unitId, Grouping: r["Grouping"] ?? name });

      const parentGeo = await fetchTableAsObjects(eid, tables, 2);
      if (parentGeo.length) {
        for (let rowIndex = 0; rowIndex < parentGeo.length; rowIndex++) {
          const sub = await wialonGetResultSubrows(eid, 2, rowIndex);
          for (const row of sub ?? []) {
            const cells = row?.c ?? [];
            const values = cells.map((c) => (typeof c === "string" ? c : c?.t ?? ""));
            // Expected order in notebook: [Grouping, Geofence, Time in, Time out, Duration in]
            geofenceRows.push({
              Grouping: String(values[0] ?? name),
              Geofence: String(values[1] ?? ""),
              "Time in": String(values[2] ?? ""),
              "Time out": String(values[3] ?? ""),
              "Duration in": String(values[4] ?? ""),
              unit_id: unitId,
            });
          }
        }
      }
    }

    // Convert timestamp columns like the notebook.
    const locOut = convertTimestampColumnsToEat(locRows, ["Last message time", "Last coordinates time"]);
    const mileageOut = convertTimestampColumnsToEat(mileageRows, []);
    const geofenceOut = convertTimestampColumnsToEat(geofenceRows, ["Time in", "Time out"]);

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

    const mileageFinal = mileageOut.map((r) => ({
      ...r,
      "Mileage 4HRs": typeof r.unit_id === "number" ? (mileage4ByUnit.get(r.unit_id) ?? "") : "",
    }));

    // Build Excel
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(locOut), "Last Location");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mileageFinal), "Mileage");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(geofenceOut), "Geofences");

    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
    const filename = `Menengai_4HR_${start.replace(/[:]/g, "-")}_to_${end.replace(/[:]/g, "-")}.xlsx`;

    const res = new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Missing-Vehicles": missing.slice(0, 50).join(" | "),
      },
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 },
    );
  }
}

