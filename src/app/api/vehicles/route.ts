import { NextResponse } from "next/server";

const WIALON_URL = "https://hst-api.wialon.com/wialon/ajax.html";

type WialonLoginResponse = { eid?: string; error?: number };
type SearchItemsResponse = {
  items?: Array<{ id: number; nm?: string }>;
  error?: number;
};

function normName(s: string) {
  return String(s ?? "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
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

async function wialonSearchUnits(eid: string) {
  // flags=1 returns basic item fields including id + name (nm)
  const params = {
    spec: {
      itemsType: "avl_unit",
      propName: "sys_name",
      propValueMask: "*",
      sortType: "sys_name",
    },
    force: 1,
    flags: 1,
    from: 0,
    to: 0xffffffff,
  };

  const body = new URLSearchParams({
    svc: "core/search_items",
    params: JSON.stringify(params),
    sid: eid,
  });

  const res = await fetch(WIALON_URL, { method: "POST", body });
  const json = (await res.json()) as SearchItemsResponse;
  if (json.error) throw new Error(`Wialon search_items failed (error=${json.error})`);
  return json.items ?? [];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = normName(searchParams.get("q") ?? "CPO - MENENGAI");

    const token = process.env.WIALON_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing WIALON_TOKEN env var" },
        { status: 500 },
      );
    }

    const eid = await wialonLogin(token);
    const units = await wialonSearchUnits(eid);

    const vehicles = units
      .map((u) => ({ id: u.id, name: u.nm ?? "" }))
      .filter((v) => v.name && normName(v.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ vehicles });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

