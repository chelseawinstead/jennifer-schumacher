import postgres from "npm:postgres@3.4.4";

// Connect through Supabase's transaction pooler (port 6543), not the direct connection,
// so a burst of visitors can't use up the database's connection slots (it also runs the CRM).
const _direct = new URL(Deno.env.get("SUPABASE_DB_URL")!);
const sql = postgres({
  host: "aws-1-us-east-1.pooler.supabase.com", port: 6543, database: "postgres",
  user: "postgres.agnpwmdwofrdyqzttmlv", password: decodeURIComponent(_direct.password),
  ssl: "require", prepare: false, max: 2, idle_timeout: 10, connect_timeout: 10,
});
// The public seat counter is polled by every open page; answer from a short cache.
let _status: { at: number; body: unknown } | null = null;
const SITE = Deno.env.get("VB_SITE_URL") || "https://www.schumacherliving.com";

const ALLOWED = ["https://www.schumacherliving.com", "https://schumacherliving.com"];
function corsFor(origin: string | null) {
  const ok = origin && (ALLOWED.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOWED[0],
    "Access-Control-Allow-Headers": "content-type, x-team-password",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["hold", "waitlist", "offer", "paid", "agenda", "local_confirm", "local_waitlist", "local_offer"] as const;
type Kind = typeof KINDS[number];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function azTime(iso: string | null) {
  if (!iso) return "within 72 hours";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " Arizona time";
}

// ---------- email rendering ----------
type Tpl = { subject: string; heading: string; body: string };
type Guest = { id: string; first_name: string; last_name: string; email: string; code: string; amount: number; hold_expires_at: string | null };
type Settings = { zelle_to: string | null; hotel_code: string | null; email_templates: Record<string, Tpl>; mailer_url: string | null; mailer_token: string | null; guide_passcode?: string | null };

function fill(s: string, g: Guest, st: Settings) {
  const v: Record<string, string> = {
    first_name: g.first_name, last_name: g.last_name, code: g.code,
    amount: "$" + Number(g.amount).toLocaleString(), deadline: azTime(g.hold_expires_at),
    zelle_to: st.zelle_to || "info@schumacherliving.com",
    hotel_code: st.hotel_code || "[hotel discount code]",
    payment_link: `${SITE}/vision-board/pay?r=${g.id}`,
    agenda_link: `${SITE}/vision-board/2027-agenda?r=${g.id}`,
  };
  return String(s || "").replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
}

export function renderEmail(kind: Kind, g: Guest, st: Settings, override?: Partial<Tpl>) {
  const t: Tpl = { ...(st.email_templates?.[kind] || { subject: "", heading: "", body: "" }), ...(override || {}) };
  const subject = fill(t.subject, g, st);
  const heading = fill(t.heading, g, st);
  const body = fill(t.body, g, st);
  const link = `${SITE}/vision-board/pay?r=${g.id}`;
  const serif = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
  const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  // [words](https://...) in a template becomes a clickable link
  const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const linkify = (h: string) => h.replace(LINK, (_m, t, u) => `<a href="${u}" style="color:#002349;text-decoration:underline">${t}</a>`);
  const paras = body.split(/\n\s*\n/).map((p) =>
    `<p style="margin:0 0 16px;font:16px/1.7 ${sans};color:#55585c">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`).join("");
  const wantsPayment = kind === "hold" || kind === "offer";
  const isCustom = String(kind).endsWith("custom"); // custom emails: Jennifer writes everything, no event footer
  const row = (k: string, v: string) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e4e1da;font:14px ${sans};color:#9a968d;width:130px;vertical-align:top">${k}</td><td style="padding:10px 0;border-bottom:1px solid #e4e1da;font:16px ${sans};color:#14181d">${v}</td></tr>`;
  const details = wantsPayment ? `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 24px">
        ${row("Your code", `<span style="font:28px ${serif};color:#002349;letter-spacing:.04em">${esc(g.code)}</span>`)}
        ${row("Amount", "$" + Number(g.amount).toLocaleString())}
        ${row("Zelle to", esc(st.zelle_to || "info@schumacherliving.com"))}
        ${row("Zelle memo", esc(g.code))}
        ${row("Pay by", esc(azTime(g.hold_expires_at)))}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px"><tr><td style="background:#002349">
        <a href="${link}" style="display:inline-block;padding:16px 30px;font:13px ${sans};letter-spacing:.16em;text-transform:uppercase;color:#ffffff;text-decoration:none">View my payment details</a>
      </td></tr></table>` : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f5f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff">
      <tr><td style="background:#002349;padding:28px 36px">
        <div style="font:20px ${serif};letter-spacing:.18em;color:#ffffff">JENNIFER SCHUMACHER</div>
        <div style="font:10px ${sans};letter-spacing:.28em;color:#9fb0c2;margin-top:4px;text-transform:uppercase">Russ Lyon Sotheby's International Realty</div>
      </td></tr>
      <tr><td style="padding:40px 36px 20px">
        <div style="font:12px ${sans};letter-spacing:.24em;text-transform:uppercase;color:#002349;margin-bottom:14px">Vision Board Crew 2027</div>
        ${heading ? `<h1 style="margin:0 0 20px;font:400 34px/1.15 ${serif};color:#14181d">${esc(heading)}</h1>` : ""}
        ${paras}${details}
      </td></tr>
      ${isCustom ? "" : `<tr><td style="padding:24px 36px;border-top:1px solid #e4e1da;font:14px/1.7 ${sans};color:#55585c">
        <strong style="color:#14181d">${kind.startsWith("local") ? "Vision Board Party &middot; Saturday, January 9, 2027 &middot; 2:00&ndash;6:00pm" : "Friday &amp; Saturday, January 8&ndash;9, 2027"}</strong><br>
        ANdAZ Resort, 6114 N Scottsdale Rd, Scottsdale, AZ 85253<br><br>
        Questions? Reply to this email or call Jennifer at (480) 322-2593.
      </td></tr>`}
    </table>
    <div style="font:11px/1.6 ${sans};color:#9a968d;max-width:600px;margin-top:16px">Jennifer Schumacher · Russ Lyon Sotheby's International Realty · 6900 E. Camelback Rd., Suite 110, Scottsdale, AZ 85251</div>
  </td></tr></table></body></html>`;

  const text = [heading, body.replace(LINK, "$1 ($2)"),
    wantsPayment ? `Your code: ${g.code}\nAmount: $${Number(g.amount).toLocaleString()}\nZelle to: ${st.zelle_to || "info@schumacherliving.com"}\nZelle memo: ${g.code}\nPay by: ${azTime(g.hold_expires_at)}\nYour payment details: ${link}` : "",
    isCustom ? "" : (kind.startsWith("local") ? "Vision Board Party - Saturday, January 9, 2027, 2:00-6:00pm" : "Friday & Saturday, January 8-9, 2027") + "\nANdAZ Resort, 6114 N Scottsdale Rd, Scottsdale, AZ 85253\nQuestions? Reply to this email or call Jennifer at (480) 322-2593."]
    .filter(Boolean).join("\n\n");
  return { subject, heading, body, html, text };
}

async function loadSettings(): Promise<Settings> {
  const [s] = await sql`select zelle_to, hotel_code, email_templates, mailer_url, mailer_token, guide_passcode from vision_board.settings where id = 1`;
  return s as Settings;
}
async function loadGuest(where: { id?: string; code?: string }): Promise<(Guest & { status: string }) | null> {
  const rows = where.id
    ? await sql`select id, first_name, last_name, email, code, amount, hold_expires_at, status, track from vision_board.registrations where id = ${where.id}`
    : await sql`select id, first_name, last_name, email, code, amount, hold_expires_at, status, track from vision_board.registrations where code = ${where.code!}`;
  if (!rows.length) return null;
  const r = rows[0];
  return { ...r, hold_expires_at: r.hold_expires_at ? new Date(r.hold_expires_at).toISOString() : null } as Guest & { status: string };
}

// Sends through the Google Apps Script web app in Jennifer's own Google account.
async function sendViaGmail(st: Settings, to: string, m: { subject: string; html: string; text: string }) {
  if (!st.mailer_url || !st.mailer_token) return { ok: false, error: "Gmail isn't connected yet" };
  const res = await fetch(st.mailer_url, {
    method: "POST", redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: st.mailer_token, to, subject: m.subject, html: m.html, text: m.text }),
  });
  const raw = await res.text();
  try { return JSON.parse(raw); } catch { return { ok: false, error: "Unexpected reply from Gmail script (" + res.status + ")" }; }
}

async function logEmail(id: string, kind: string, by: string, result: { ok: boolean; error?: string }) {
  const entry = { kind, by, at: new Date().toISOString(), ok: !!result.ok, error: result.ok ? undefined : String(result.error || "").slice(0, 200) };
  await sql`update vision_board.registrations set email_log = email_log || ${sql.json([entry])}::jsonb
    ${kind === "paid" && result.ok ? sql`, confirmation_sent_at = now()` : sql``}
    ${(kind === "hold" || kind === "waitlist") && by === "auto" && result.ok ? sql`, welcome_email_sent_at = now()` : sql``}
    ${(kind === "agenda" || kind === "local_confirm") && result.ok ? sql`, agenda_link_sent_at = now()` : sql``}
    ${(kind === "local_confirm" || kind === "local_waitlist") && by === "auto" && result.ok ? sql`, welcome_email_sent_at = now()` : sql``}
    where id = ${id}`;
}

async function sendKind(id: string, kind: Kind, by: string) {
  try {
    const g = await loadGuest({ id });
    if (!g) return { ok: false, error: "not_found" };
    const st = await loadSettings();
    const result = await sendViaGmail(st, g.email, renderEmail(kind, g, st));
    await logEmail(g.id, kind, by, result);
    return result;
  } catch (e) {
    console.error("send " + kind, e);
    return { ok: false, error: String(e).slice(0, 120) };
  }
}

// Storage accepts the newer sb_secret_ keys only in the apikey header; older JWT keys go in both.
function storageAuth(): Record<string, string> {
  const k = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return k.startsWith("sb_") ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` };
}

async function sendWelcome(code: string) {
  try {
    const g = await loadGuest({ code });
    if (!g) return;
    const st = await loadSettings();
    const local = (g as any).track === "local";
    const kind: Kind = local ? (g.status === "waitlist" ? "local_waitlist" : "local_confirm") : (g.status === "waitlist" ? "waitlist" : "hold");
    const m = renderEmail(kind, g, st);
    const result = await sendViaGmail(st, g.email, m);
    await logEmail(g.id, kind, "auto", result);
  } catch (e) {
    console.error("welcome email", e);
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "status";

    if (req.method === "GET" && action === "status") {
      if (_status && Date.now() - _status.at < 4000) return json(_status.body);
      const [row] = await sql`select vision_board.public_status() as s`;
      _status = { at: Date.now(), body: row.s };
      return json(row.s);
    }

    if (req.method === "GET" && action === "guest") {
      const id = clean(url.searchParams.get("r"), 40);
      if (!UUID.test(id)) return json({ ok: false }, 404);
      const [row] = await sql`select vision_board.guest_view(${id}::uuid) as g`;
      return json(row.g, row.g.ok ? 200 : 404);
    }

    // Contact cards (.vcf). Served as a real file so iPhone/Android open their "Add contact" screen.
    //   ?action=vcard&host=1                  Jennifer (public info)
    //   ?action=vcard&r=<guest id>&p=<public_id>   one Crew member, with the viewer's private note
    //   ?action=vcard&r=<guest id>&all=1      everyone in the Crew list except the viewer
    if (req.method === "GET" && action === "vcard") {
      const ve = (v: unknown) => String(v ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
      const digits = (v: unknown) => String(v ?? "").replace(/[^\d+]/g, "");
      const ig = (h: string) => `https://www.instagram.com/${encodeURIComponent(h.replace(/^@/, ""))}/`;
      const fb = (f: string) => /^https?:\/\//i.test(f) ? f : `https://www.facebook.com/${encodeURIComponent(f.replace(/^@/, ""))}`;
      async function photoLine(url: string | null | undefined) {
        if (!url) return "";
        try {
          const abs = url.startsWith("/") ? SITE + url : url;
          const r = await fetch(abs); if (!r.ok) return "";
          const buf = new Uint8Array(await r.arrayBuffer()); if (buf.length > 400_000) return "";
          let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          return "PHOTO;ENCODING=b;TYPE=JPEG:" + btoa(bin);
        } catch { return ""; }
      }
      type P = { first_name?: string; last_name?: string; name?: string; company?: string; title?: string; phone?: string; email?: string;
        city?: string; state?: string; website?: string; instagram?: string; facebook?: string; linkedin?: string; youtube?: string; note?: string; photo?: string };
      const card = (p: P) => {
        const L = ["BEGIN:VCARD", "VERSION:3.0", `N:${ve(p.last_name)};${ve(p.first_name)};;;`, `FN:${ve(p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim())}`];
        if (p.company) L.push(`ORG:${ve(p.company)}`);
        if (p.title) L.push(`TITLE:${ve(p.title)}`);
        if (p.phone && digits(p.phone).replace(/\D/g, "").replace(/0/g, "")) L.push(`TEL;TYPE=CELL:${digits(p.phone)}`);
        if (p.email) L.push(`EMAIL;TYPE=INTERNET:${p.email}`);
        if (p.city || p.state) L.push(`ADR;TYPE=WORK:;;;${ve(p.city)};${ve(p.state)};;`);
        if (p.website) L.push(`URL:${p.website}`);
        if (p.instagram) L.push(`X-SOCIALPROFILE;TYPE=instagram:${ig(p.instagram)}`);
        if (p.facebook) L.push(`X-SOCIALPROFILE;TYPE=facebook:${fb(p.facebook)}`);
        if (p.linkedin) L.push(`X-SOCIALPROFILE;TYPE=linkedin:${p.linkedin}`);
        if (p.youtube) L.push(`X-SOCIALPROFILE;TYPE=youtube:${p.youtube}`);
        // Labeled links too: iPhone and Android both show these, even when they skip X-SOCIALPROFILE
        let n = 0;
        const item = (label: string, u: string) => { n++; L.push(`item${n}.URL:${u}`, `item${n}.X-ABLabel:${label}`); };
        if (p.instagram) item("Instagram", ig(p.instagram));
        if (p.facebook) item("Facebook", fb(p.facebook));
        if (p.linkedin) item("LinkedIn", p.linkedin);
        if (p.youtube) item("YouTube", p.youtube);
        if (p.note) L.push(`NOTE:${ve(p.note)}`);
        if (p.photo) L.push(p.photo);
        L.push("END:VCARD");
        return L.join("\r\n");
      };
      const vcf = (body: string, file: string) => new Response(body + "\r\n", { headers: { ...cors,
        "Content-Type": "text/vcard; charset=utf-8", "Content-Disposition": `inline; filename="${file}"`, "Cache-Control": "no-store" } });
      const MET = "Met at Vision Board Crew 2027 (Jan 8-9, Scottsdale).";

      if (url.searchParams.get("host")) {
        const [row] = await sql`select guide->'host' as h from vision_board.settings where id = 1`;
        const h = row.h || {};
        const parts = String(h.name || "Jennifer Schumacher").split(/\s+/);
        const links = [h.instagram ? "Instagram: " + ig(h.instagram) : "", h.facebook ? "Facebook: " + fb(h.facebook) : "", h.linkedin ? "LinkedIn: " + h.linkedin : "", h.youtube ? "YouTube: " + h.youtube : ""].filter(Boolean).join("\n");
        return vcf(card({ first_name: parts[0], last_name: parts.slice(1).join(" "), name: h.name || "Jennifer Schumacher",
          company: "Russ Lyon Sotheby's International Realty", title: "Global Real Estate Advisor", phone: h.phone, email: h.email,
          website: h.website, instagram: h.instagram, facebook: h.facebook, linkedin: h.linkedin, youtube: h.youtube,
          note: "Host of Vision Board Crew 2027." + (links ? "\n" + links : ""), photo: await photoLine(h.photo_url) }), "Jennifer-Schumacher.vcf");
      }
      const id = clean(url.searchParams.get("r"), 40);
      if (!UUID.test(id)) return json({ ok: false }, 404);
      const [row] = await sql`select vision_board.guide_for_guest(${id}::uuid) as g`;
      if (!row.g.ok) return json({ ok: false }, 403);
      const crew = (row.g.crew || []) as any[];
      const toP = (c: any): P => ({ first_name: c.first_name, last_name: c.last_name, name: c.name, company: c.company, phone: c.phone, email: c.email,
        city: c.city, state: c.state, instagram: c.instagram, facebook: c.facebook,
        note: [MET, c.instagram ? "Instagram: " + ig(c.instagram) : "", c.facebook ? "Facebook: " + fb(c.facebook) : "", c.my_note ? "\nMy notes: " + c.my_note : ""].filter(Boolean).join("\n") });
      if (url.searchParams.get("all")) {
        const others = crew.filter((c) => !c.me);
        return vcf(others.map((c) => card(toP(c))).join("\r\n"), "Vision-Board-Crew-2027.vcf");
      }
      const pid = clean(url.searchParams.get("p"), 40);
      const c = crew.find((x) => x.id === pid);
      if (!c) return json({ ok: false }, 404);
      return vcf(card({ ...toP(c), photo: await photoLine(c.photo_url) }), (String(c.name).replace(/[^\w ]/g, "").replace(/\s+/g, "-") || "contact") + ".vcf");
    }

    // Event agenda, opened with a paid guest's personal link (?r=<their id>)
    if (req.method === "POST" && action === "agenda") {
      const b = await req.json().catch(() => ({}));
      const id = clean(b.r, 40);
      if (!UUID.test(id)) return json({ ok: false, reason: "not_found" }, 404);
      const [row] = await sql`select vision_board.guide_for_guest(${id}::uuid) as g`;
      return json(row.g, row.g.ok ? 200 : 403);
    }

    // A paid guest updates their own Crew profile: listing on/off, Instagram, Facebook, photo
    if (req.method === "POST" && action === "profile") {
      const b = await req.json().catch(() => ({}));
      const id = clean(b.r, 40);
      if (!UUID.test(id)) return json({ ok: false }, 404);
      const ig = clean(b.instagram, 80).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
      const fb = clean(b.facebook, 200);
      const [row] = await sql`select vision_board.guest_update_profile(${id}::uuid, ${b.directory_opt_in === true}, ${ig}, ${fb}) as r`;
      if (!row.r.ok) return json({ ok: false }, 403);
      // Company / city / state as shown in the app (the registration on file is left alone)
      if ("email" in b) {
        const [d] = await sql`select vision_board.guest_update_details(${id}::uuid, ${clean(b.company, 120)}, ${clean(b.city, 80)}, ${clean(b.state, 40)}, ${clean(b.email, 160)}) as r`;
        if (!d.r.ok) return json({ ok: false, error: d.r.error || "details" }, 400);
      } else if ("company" in b || "city" in b || "state" in b) {
        await sql`select vision_board.guest_update_details(${id}::uuid, ${clean(b.company, 120)}, ${clean(b.city, 80)}, ${clean(b.state, 40)})`;
      }

      if (b.remove_photo || typeof b.photo === "string") {
        let url: string | null = null;
        if (typeof b.photo === "string") {
          const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(b.photo);
          if (!m) return json({ ok: false, error: "photo" }, 400);
          const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
          if (bytes.length > 1_500_000) return json({ ok: false, error: "photo_too_big" }, 400);
          const path = `${id}-${Date.now()}.jpg`;
          const up = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/vision-board-photos/${path}`, {
            method: "POST",
            headers: { ...storageAuth(), "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "31536000" },
            body: bytes,
          });
          if (!up.ok) { console.error("photo upload", up.status, await up.text()); return json({ ok: false, error: "upload" }, 502); }
          url = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/vision-board-photos/${path}`;
        }
        const [ph] = await sql`select vision_board.guest_set_photo(${id}::uuid, ${url}) as r`;
        const old = ph.r.old as string | null;
        const prefix = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/vision-board-photos/`;
        if (old && old.startsWith(prefix)) {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/vision-board-photos/${old.slice(prefix.length)}`, {
            method: "DELETE", headers: storageAuth(),
          }).catch(() => {});
        }
      }
      const [g] = await sql`select vision_board.guide_for_guest(${id}::uuid) as g`;
      return json(g.g);
    }

    // ---------- Chat: posts, photos, threads, reactions, @tags ----------
    if (req.method === "POST" && action.startsWith("feed")) {
      const b = await req.json().catch(() => ({}));
      const id = clean(b.r, 40);
      if (!UUID.test(id)) return json({ ok: false }, 404);
      const pid = UUID.test(clean(b.post, 40)) ? clean(b.post, 40) : null;
      let row: any;
      if (action === "feed") {
        const before = b.before && !isNaN(Date.parse(b.before)) ? new Date(b.before).toISOString() : null;
        [row] = await sql`select vision_board.feed_list(${id}::uuid, ${before}::timestamptz) as r`;
      } else if (action === "feed-thread") {
        if (!pid) return json({ ok: false }, 404);
        [row] = await sql`select vision_board.feed_thread(${id}::uuid, ${pid}::uuid) as r`;
      } else if (action === "feed-post") {
        const v = await sql`select (vision_board._feed_viewer(${id}::uuid)).id as vid`;
        if (!v[0].vid) return json({ ok: false }, 403);
        const photos: string[] = [];
        for (const d of (Array.isArray(b.photos) ? b.photos : []).slice(0, 4)) {
          const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ""));
          if (!m) return json({ ok: false, error: "photo" }, 400);
          const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
          if (bytes.length > 1_900_000) return json({ ok: false, error: "photo_too_big" }, 400);
          const path = `chat/${crypto.randomUUID()}.jpg`;
          const up = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/vision-board-photos/${path}`, {
            method: "POST", headers: { ...storageAuth(), "Content-Type": "image/jpeg", "cache-control": "31536000" }, body: bytes,
          });
          if (!up.ok) { console.error("chat photo upload", up.status, await up.text()); return json({ ok: false, error: "upload" }, 502); }
          photos.push(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/vision-board-photos/${path}`);
        }
        [row] = await sql`select vision_board.feed_create(${id}::uuid, ${pid}::uuid, ${String(b.body ?? "").slice(0, 2000)}, ${photos}::text[]) as r`;
      } else if (action === "feed-react") {
        if (!pid) return json({ ok: false }, 404);
        [row] = await sql`select vision_board.feed_react(${id}::uuid, ${pid}::uuid, ${clean(b.emoji, 16)}) as r`;
      } else if (action === "feed-delete") {
        if (!pid) return json({ ok: false }, 404);
        [row] = await sql`select vision_board.feed_delete(${id}::uuid, ${pid}::uuid) as r`;
      } else if (action === "feed-poll") {
        const since = b.since && !isNaN(Date.parse(b.since)) ? new Date(b.since).toISOString() : null;
        [row] = await sql`select vision_board.feed_poll(${id}::uuid, ${since}::timestamptz) as r`;
      } else if (action === "feed-seen") {
        [row] = await sql`select vision_board.feed_seen(${id}::uuid) as r`;
      } else return json({ ok: false, error: "not_found" }, 404);
      return json(row.r, row.r.ok ? 200 : (row.r.error === "slow" || row.r.error === "empty" || row.r.error === "emoji" ? 400 : 403));
    }

    // A guest's private note about someone they met (only the author ever sees it)
    if (req.method === "POST" && action === "note") {
      const b = await req.json().catch(() => ({}));
      const id = clean(b.r, 40), subject = clean(b.person, 40);
      if (!UUID.test(id) || !UUID.test(subject)) return json({ ok: false }, 404);
      const [row] = await sql`select vision_board.guest_save_note(${id}::uuid, ${subject}::uuid, ${String(b.body ?? "").slice(0, 4000)}) as r`;
      return json(row.r, row.r.ok ? 200 : 403);
    }

    // "Email me my link": always the same reply, so it can't be used to check who registered
    if (req.method === "POST" && action === "agenda-link") {
      const b = await req.json().catch(() => ({}));
      const email = clean(b.email, 160);
      if (EMAIL.test(email)) {
        const [row] = await sql`select vision_board.agenda_link_request(${email}) as r`;
        // @ts-ignore EdgeRuntime is provided by Supabase
        if (row.r.send) EdgeRuntime.waitUntil(sendKind(row.r.id, row.r.kind === "local_confirm" ? "local_confirm" : "agenda", "guest"));
      }
      await new Promise((r) => setTimeout(r, 600));
      return json({ ok: true });
    }

    // A guest turns their own directory listing on or off from their private payment page
    if (req.method === "POST" && action === "guest-optin") {
      const b = await req.json().catch(() => ({}));
      const id = clean(b.r, 40);
      if (!UUID.test(id)) return json({ ok: false }, 404);
      const rows = await sql`select vision_board.guest_set_optin(${id}::uuid, ${b.on === true}) as r`;
      return rows.length && rows[0].r ? json(rows[0].r) : json({ ok: false }, 404);
    }

    // ---------- Local guests (free, 30 spots, own waitlist) ----------
    if (req.method === "GET" && action === "local-status") {
      const [row] = await sql`select vision_board.local_public_status() as s`;
      return json(row.s);
    }
    if (req.method === "POST" && action === "register-local") {
      const b = await req.json().catch(() => ({}));
      if (clean(b.website)) return json({ ok: true, ignored: true }); // honeypot
      const f = {
        first: clean(b.first_name, 80), last: clean(b.last_name, 80), email: clean(b.email, 160),
        phone: clean(b.phone, 40), street: clean(b.street), street2: clean(b.street2),
        city: clean(b.city, 80), state: clean(b.state, 40), zip: clean(b.zip, 12), company: clean(b.company, 120),
      };
      const missing = Object.entries(f).filter(([k, v]) => k !== "street2" && k !== "company" && !v).map(([k]) => k);
      if (missing.length) return json({ ok: false, error: "missing", fields: missing }, 400);
      if (!EMAIL.test(f.email)) return json({ ok: false, error: "email" }, 400);
      if (f.phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "phone" }, 400);
      const [row] = await sql`select vision_board.register_local(${f.first}, ${f.last}, ${f.email}, ${f.phone},
        ${f.street}, ${f.street2}, ${f.city}, ${f.state}, ${f.zip}, ${f.company}) as r`;
      // @ts-ignore EdgeRuntime is provided by Supabase
      if (row.r.ok && !row.r.duplicate) EdgeRuntime.waitUntil(sendWelcome(row.r.code));
      return json(row.r, row.r.ok ? 200 : 409);
    }
    if (req.method === "POST" && action === "local-accept") {
      const b = await req.json().catch(() => ({}));
      const id = clean(b.r, 40);
      if (!UUID.test(id)) return json({ ok: false }, 404);
      const [row] = await sql`select vision_board.local_accept(${id}::uuid) as r`;
      // @ts-ignore EdgeRuntime is provided by Supabase
      if (row.r.ok && !row.r.already) EdgeRuntime.waitUntil(sendKind(id, "local_confirm", "guest"));
      return json(row.r, row.r.ok ? 200 : 409);
    }
    if (req.method === "POST" && action === "confirm-address") {
      const b = await req.json().catch(() => ({}));
      const id = clean(b.r, 40);
      if (!UUID.test(id)) return json({ ok: false }, 404);
      const a = b.address || {};
      const [row] = await sql`select vision_board.guest_confirm_address(${id}::uuid, ${sql.json({ street: clean(a.street), street2: clean(a.street2), city: clean(a.city, 80), state: clean(a.state, 40), zip: clean(a.zip, 12) })}) as r`;
      return json(row.r, row.r.ok ? 200 : 400);
    }

    if (req.method === "POST" && action === "register") {
      const b = await req.json().catch(() => ({}));
      if (clean(b.website)) return json({ ok: true, ignored: true }); // honeypot
      const f = {
        first: clean(b.first_name, 80), last: clean(b.last_name, 80), email: clean(b.email, 160),
        phone: clean(b.phone, 40), street: clean(b.street), street2: clean(b.street2),
        city: clean(b.city, 80), state: clean(b.state, 40), zip: clean(b.zip, 12),
        company: clean(b.company, 120),
      };
      const optin = b.directory_opt_in === true || b.directory_opt_in === "on" || b.directory_opt_in === "true";
      const missing = Object.entries(f).filter(([k, v]) => k !== "street2" && !v).map(([k]) => k);
      if (missing.length) return json({ ok: false, error: "missing", fields: missing }, 400);
      if (!EMAIL.test(f.email)) return json({ ok: false, error: "email" }, 400);
      if (f.phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "phone" }, 400);
      const [row] = await sql`select vision_board.register(${f.first}, ${f.last}, ${f.email}, ${f.phone},
        ${f.street}, ${f.street2}, ${f.city}, ${f.state}, ${f.zip}, ${f.company}, ${optin}) as r`;
      _status = null;
      if (row.r.ok && !row.r.duplicate) {
        // send after responding so the guest never waits on Gmail
        // @ts-ignore EdgeRuntime is provided by Supabase
        EdgeRuntime.waitUntil(sendWelcome(row.r.code));
      }
      return json(row.r, row.r.ok ? 200 : 409);
    }

    if (action.startsWith("team")) {
      const pw = req.headers.get("x-team-password") || "";
      const [chk] = await sql`select vision_board.check_password(${pw}) as ok`;
      if (!chk.ok) {
        await new Promise((r) => setTimeout(r, 1200));
        return json({ ok: false, error: "password" }, 401);
      }
      if (action === "team-list") {
        const [row] = await sql`select vision_board.team_list() as d`;
        return json(row.d);
      }
      const b = req.method === "POST" ? await req.json().catch(() => ({})) : {};

      if (action === "team-action" && req.method === "POST") {
        const [row] = await sql`select vision_board.team_action(${clean(b.id, 40)}::uuid, ${clean(b.action, 20)}, ${b.value == null ? null : clean(b.value, 2000)}) as r`;
        return json(row.r, row.r.ok ? 200 : 409);
      }

      // Save the editable email templates (and the hotel code they can mention)
      if (action === "team-templates" && req.method === "POST") {
        const st = await loadSettings();
        const next: Record<string, Tpl> = { ...(st.email_templates || {}) };
        for (const k of KINDS) {
          const t = b.templates?.[k];
          if (t) next[k] = { subject: clean(t.subject, 200), heading: clean(t.heading, 200), body: clean(t.body, 5000) };
        }
        const hotel = b.hotel_code == null ? st.hotel_code : (clean(b.hotel_code, 100) || null);
        await sql`update vision_board.settings set email_templates = ${sql.json(next)}, hotel_code = ${hotel}, updated_at = now() where id = 1`;
        return json({ ok: true });
      }

      // Render an email: for a real guest (id) or a sample guest for the template preview
      if (action === "team-email-render" && req.method === "POST") {
        const kind = clean(b.kind, 20) as Kind;
        if (!KINDS.includes(kind) && (kind as string) !== "custom" && (kind as string) !== "local_custom") return json({ ok: false, error: "kind" }, 400);
        const st = await loadSettings();
        if (b.hotel_code != null) st.hotel_code = clean(b.hotel_code, 100) || null;
        const g = b.id ? await loadGuest({ id: clean(b.id, 40) }) : {
          id: "00000000-0000-0000-0000-000000000000", first_name: "Sarah", last_name: "Mitchell", email: "sarah@example.com",
          code: "VB-014", amount: 1150, hold_expires_at: new Date(Date.now() + 72 * 36e5).toISOString(), status: "pending",
        };
        if (!g) return json({ ok: false, error: "not_found" }, 404);
        const m = renderEmail(kind, g, st, b.template || undefined);
        return json({ ok: true, to: g.email, ...m, mailer_connected: !!st.mailer_url });
      }

      // Send an email to one guest from Jennifer's Gmail, using the template (optionally edited for just this send)
      if (action === "team-email-send" && req.method === "POST") {
        const kind = clean(b.kind, 20) as Kind;
        if (!KINDS.includes(kind)) return json({ ok: false, error: "kind" }, 400);
        const g = await loadGuest({ id: clean(b.id, 40) });
        if (!g) return json({ ok: false, error: "not_found" }, 404);
        const st = await loadSettings();
        const m = renderEmail(kind, g, st, b.template ? { subject: clean(b.template.subject, 200), heading: clean(b.template.heading, 200), body: clean(b.template.body, 5000) } : undefined);
        const result = await sendViaGmail(st, g.email, m);
        await logEmail(g.id, kind, "team", result);
        return json(result, result.ok ? 200 : 502);
      }

      if (action === "team-guide-save" && req.method === "POST") {
        const g = b.guide;
        if (!g || typeof g !== "object") return json({ ok: false, error: "guide" }, 400);
        const str = (v: unknown, n = 500) => clean(v, n);
        const httpsOnly = (v: unknown) => { let u = clean(v, 1000); if (u && !/^https?:\/\//i.test(u) && /\.[a-z]{2,}/i.test(u)) u = "https://" + u; return /^https:\/\//i.test(u) ? u : (/^http:\/\//i.test(u) ? u : ""); };
        const guide = {
          welcome: str(g.welcome, 1000),
          host: {
            name: str(g.host?.name, 120), title: str(g.host?.title, 200),
            photo_url: /^\/[\w\-./]+$/.test(str(g.host?.photo_url, 500)) ? str(g.host?.photo_url, 500) : httpsOnly(g.host?.photo_url),
            phone: str(g.host?.phone, 40), email: EMAIL.test(str(g.host?.email, 160)) ? str(g.host?.email, 160) : "",
            website: httpsOnly(g.host?.website),
            instagram: str(g.host?.instagram, 80).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, ""),
            facebook: str(g.host?.facebook, 300), linkedin: httpsOnly(g.host?.linkedin), youtube: httpsOnly(g.host?.youtube),
          },
          venue: {
            name: str(g.venue?.name, 200), address: str(g.venue?.address, 300), phone: str(g.venue?.phone, 60),
            booking_label: str(g.venue?.booking_label, 120), booking_url: /^https?:\/\//.test(str(g.venue?.booking_url, 1000)) ? str(g.venue?.booking_url, 1000) : "",
            details: str(g.venue?.details, 3000),
          },
          days: (Array.isArray(g.days) ? g.days : []).slice(0, 6).map((d: any) => ({
            label: str(d?.label, 120),
            items: (Array.isArray(d?.items) ? d.items : []).slice(0, 40).map((i: any) => ({
              id: /^[A-Za-z0-9_-]{1,64}$/.test(str(i?.id, 64)) ? str(i?.id, 64) : crypto.randomUUID(),
              audience: (Array.isArray(i?.audience) ? i.audience : ["paid"]).filter((a: unknown) => a === "paid" || a === "local"),
              time: str(i?.time, 60), title: str(i?.title, 200), location: str(i?.location, 200), dress: str(i?.dress, 200), details: str(i?.details, 1500),
              speakers: (Array.isArray(i?.speakers) ? i.speakers : []).slice(0, 12).map((sp: any) => ({
                name: str(sp?.name, 120), title: str(sp?.title, 200), bio: str(sp?.bio, 1500),
                photo_url: httpsOnly(sp?.photo_url), website: httpsOnly(sp?.website),
                instagram: str(sp?.instagram, 80).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, ""),
                facebook: str(sp?.facebook, 300), linkedin: httpsOnly(sp?.linkedin),
              })).filter((sp: any) => sp.name),
            })),
          })),
          notes: (Array.isArray(g.notes) ? g.notes : []).slice(0, 50).map((n: any) => ({
            title: str(n?.title, 200), body: str(n?.body, 5000), date: str(n?.date, 40),
          })),
        };
        const closes = b.closes_at && !isNaN(Date.parse(b.closes_at)) ? new Date(b.closes_at).toISOString() : null;
        await sql`update vision_board.settings set guide = ${sql.json(guide)},
          agenda_closes_at = coalesce(${closes}::timestamptz, agenda_closes_at), updated_at = now() where id = 1`;
        return json({ ok: true });
      }

      // Email every paid guest their personal agenda link (only those not sent yet, unless resend_all)
      if (action === "team-agenda-send" && req.method === "POST") {
        const track = b.track === "local" ? "local" : "paid";
        const rows = b.resend_all
          ? await sql`select id from vision_board.registrations where event_year = (select event_year from vision_board.settings where id = 1) and status = 'paid' and track = ${track} order by created_at`
          : await sql`select id from vision_board.registrations where event_year = (select event_year from vision_board.settings where id = 1) and status = 'paid' and track = ${track} and agenda_link_sent_at is null order by created_at`;
        const ids = rows.map((r: { id: string }) => r.id);
        const kind: Kind = track === "local" ? "local_confirm" : "agenda";
        // @ts-ignore EdgeRuntime is provided by Supabase
        EdgeRuntime.waitUntil((async () => { for (const id of ids) { await sendKind(id, kind, "team"); await new Promise((r) => setTimeout(r, 400)); } })());
        return json({ ok: true, queued: ids.length });
      }

      // Upload a speaker photo from the agenda editor; returns its public URL
      if (action === "team-upload-photo" && req.method === "POST") {
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.photo || ""));
        if (!m) return json({ ok: false, error: "photo" }, 400);
        const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
        if (bytes.length > 1_500_000) return json({ ok: false, error: "photo_too_big" }, 400);
        const path = `speakers/${crypto.randomUUID()}.jpg`;
        const up = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/vision-board-photos/${path}`, {
          method: "POST", headers: { ...storageAuth(), "Content-Type": "image/jpeg", "cache-control": "31536000" }, body: bytes,
        });
        if (!up.ok) { console.error("speaker upload", up.status, await up.text()); return json({ ok: false, error: "upload" }, 502); }
        return json({ ok: true, url: `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/vision-board-photos/${path}` });
      }

      // Seat limit for the team (public page stays at the regular capacity)
      if (action === "team-seat-limit" && req.method === "POST") {
        const [row] = await sql`select vision_board.team_set_seat_limit(${Number(b.limit) | 0}, ${b.track === "local" ? "local" : "paid"}) as r`;
        return json(row.r, row.r.ok ? 200 : 400);
      }
      // Assigned seating
      if (action === "team-seating") {
        const [row] = await sql`select vision_board.team_seating() as r`;
        return json(row.r);
      }
      if (action === "team-seating-save" && req.method === "POST") {
        const [row] = await sql`select vision_board.team_seating_save(${clean(b.session, 64)}, ${sql.json(Array.isArray(b.tables) ? b.tables.slice(0, 60) : [])}, ${sql.json(Array.isArray(b.assignments) ? b.assignments.slice(0, 600) : [])}) as r`;
        return json(row.r, row.r.ok ? 200 : 400);
      }

      if (action === "team-feed") {
        const [row] = await sql`select vision_board.team_feed() as r`;
        return json({ ok: true, posts: row.r });
      }
      if (action === "team-feed-remove" && req.method === "POST") {
        const [row] = await sql`select vision_board.team_feed_remove(${clean(b.id, 40)}::uuid) as r`;
        return json(row.r);
      }

      // ---------- Custom emails: drafts, pick recipients, send now ----------
      if (action === "team-broadcasts") {
        const [row] = await sql`select vision_board.team_broadcasts() as r`;
        return json({ ok: true, broadcasts: row.r });
      }
      if (action === "team-broadcast-save" && req.method === "POST") {
        const d = b.broadcast || {};
        const ids = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => clean(x, 40)).filter((x) => UUID.test(x)).slice(0, 1000);
        const payload = { id: UUID.test(clean(d.id, 40)) ? clean(d.id, 40) : "", subject: clean(d.subject, 200), heading: clean(d.heading, 200), body: String(d.body ?? "").slice(0, 8000),
          groups: (Array.isArray(d.groups) ? d.groups : []).map((g: unknown) => clean(g, 30)), include_ids: ids(d.include_ids), exclude_ids: ids(d.exclude_ids) };
        const [row] = await sql`select vision_board.team_broadcast_save(${sql.json(payload)}) as r`;
        return json(row.r, row.r.ok ? 200 : 409);
      }
      if ((action === "team-broadcast-delete" || action === "team-broadcast-cancel") && req.method === "POST") {
        const [row] = await sql`select vision_board.team_broadcast_cancel(${clean(b.id, 40)}::uuid, ${action === "team-broadcast-delete"}) as r`;
        return json(row.r, row.r.ok ? 200 : 409);
      }
      // Sends the next few recipients; the team page calls this repeatedly and shows progress
      if (action === "team-broadcast-step" && req.method === "POST") {
        const id = clean(b.id, 40);
        if (!UUID.test(id)) return json({ ok: false }, 404);
        const [c] = await sql`select vision_board.broadcast_claim(${id}::uuid, 10) as r`;
        const claim = c.r;
        if (claim.ok && !claim.done) {
          const st = await loadSettings();
          for (const rid of claim.recipients as string[]) {
            let result: { ok: boolean; error?: string } = { ok: false, error: "not_found" };
            try {
              const g = await loadGuest({ id: rid });
              if (g) {
                const kind = ((g as any).track === "local" ? "local_custom" : "custom") as Kind;
                result = await sendViaGmail(st, g.email, renderEmail(kind, g, st, { subject: claim.subject, heading: claim.heading, body: claim.body }));
                await logEmail(g.id, "custom", "team", result);
              }
            } catch (e) { result = { ok: false, error: String(e).slice(0, 160) }; }
            await sql`update vision_board.broadcast_sends set ok = ${!!result.ok}, error = ${result.ok ? null : String(result.error || "").slice(0, 200)}, at = now()
              where broadcast_id = ${id}::uuid and registration_id = ${rid}::uuid`;
            await new Promise((r) => setTimeout(r, 250));
          }
        }
        const [p] = await sql`select status, (select count(*) from vision_board.broadcast_sends s where s.broadcast_id = b.id and s.ok)::int as sent,
          (select count(*) from vision_board.broadcast_sends s where s.broadcast_id = b.id and s.ok = false)::int as failed,
          (select count(*) from vision_board.broadcast_recipient_ids(b.id))::int as total from vision_board.broadcasts b where id = ${id}::uuid`;
        return json({ ok: !!claim.ok, done: !!claim.done || (p && p.status !== "sending"), ...(p || {}) });
      }
      // Send one copy to any address (Jennifer's own) to check it, filled in with a real or sample guest
      if (action === "team-broadcast-test" && req.method === "POST") {
        const to = clean(b.to, 160);
        if (!EMAIL.test(to)) return json({ ok: false, error: "email" }, 400);
        const st = await loadSettings();
        const g = (UUID.test(clean(b.sample_id, 40)) && await loadGuest({ id: clean(b.sample_id, 40) })) || {
          id: "00000000-0000-0000-0000-000000000000", first_name: "Sarah", last_name: "Mitchell", email: to, code: "VB-014", amount: 1150, hold_expires_at: null, status: "paid",
        };
        const kind = ((g as any).track === "local" ? "local_custom" : "custom") as Kind;
        const m = renderEmail(kind, g, st, { subject: "[Test] " + clean(b.subject, 200), heading: clean(b.heading, 200), body: String(b.body ?? "").slice(0, 8000) });
        const result = await sendViaGmail(st, to, m);
        return json(result, result.ok ? 200 : 502);
      }

      if (action === "team-optin" && req.method === "POST") {
        await sql`select vision_board.team_set_optin(${clean(b.id, 40)}::uuid, ${b.on === true})`;
        return json({ ok: true });
      }

      if (action === "team-mailer-check") {
        const st = await loadSettings();
        if (!st.mailer_url) return json({ ok: false, error: "Gmail isn't connected yet" });
        const res = await fetch(st.mailer_url, { redirect: "follow" });
        const raw = await res.text();
        try { return json(JSON.parse(raw)); } catch { return json({ ok: false, error: "Unexpected reply (" + res.status + ")" }); }
      }
    }
    return json({ ok: false, error: "not_found" }, 404);
  } catch (e) {
    console.error(e);
    const msg = String((e as Error)?.message || e);
    if (msg.includes("vision_board_full")) return json({ ok: false, error: "full" }, 409);
    return json({ ok: false, error: "server" }, 500);
  }
});
