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
const KINDS = ["hold", "waitlist", "offer", "paid", "agenda"] as const;
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
      <tr><td style="padding:24px 36px;border-top:1px solid #e4e1da;font:14px/1.7 ${sans};color:#55585c">
        <strong style="color:#14181d">Friday &amp; Saturday, January 8&ndash;9, 2027</strong><br>
        ANdAZ Resort, 6114 N Scottsdale Rd, Scottsdale, AZ 85253<br><br>
        Questions? Reply to this email or call Jennifer at (480) 322-2593.
      </td></tr>
    </table>
    <div style="font:11px/1.6 ${sans};color:#9a968d;max-width:600px;margin-top:16px">Jennifer Schumacher · Russ Lyon Sotheby's International Realty · 6900 E. Camelback Rd., Suite 110, Scottsdale, AZ 85251</div>
  </td></tr></table></body></html>`;

  const text = [heading, body.replace(LINK, "$1 ($2)"),
    wantsPayment ? `Your code: ${g.code}\nAmount: $${Number(g.amount).toLocaleString()}\nZelle to: ${st.zelle_to || "info@schumacherliving.com"}\nZelle memo: ${g.code}\nPay by: ${azTime(g.hold_expires_at)}\nYour payment details: ${link}` : "",
    "Friday & Saturday, January 8-9, 2027\nANdAZ Resort, 6114 N Scottsdale Rd, Scottsdale, AZ 85253\nQuestions? Reply to this email or call Jennifer at (480) 322-2593."]
    .filter(Boolean).join("\n\n");
  return { subject, heading, body, html, text };
}

async function loadSettings(): Promise<Settings> {
  const [s] = await sql`select zelle_to, hotel_code, email_templates, mailer_url, mailer_token, guide_passcode from vision_board.settings where id = 1`;
  return s as Settings;
}
async function loadGuest(where: { id?: string; code?: string }): Promise<(Guest & { status: string }) | null> {
  const rows = where.id
    ? await sql`select id, first_name, last_name, email, code, amount, hold_expires_at, status from vision_board.registrations where id = ${where.id}`
    : await sql`select id, first_name, last_name, email, code, amount, hold_expires_at, status from vision_board.registrations where code = ${where.code!}`;
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
    ${kind === "agenda" && result.ok ? sql`, agenda_link_sent_at = now()` : sql``}
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
    const kind: Kind = g.status === "waitlist" ? "waitlist" : "hold";
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
        if (row.r.send) EdgeRuntime.waitUntil(sendKind(row.r.id, "agenda", "guest"));
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
        const kind = clean(b.kind, 12) as Kind;
        if (!KINDS.includes(kind)) return json({ ok: false, error: "kind" }, 400);
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
        const kind = clean(b.kind, 12) as Kind;
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
        const guide = {
          welcome: str(g.welcome, 1000),
          venue: {
            name: str(g.venue?.name, 200), address: str(g.venue?.address, 300), phone: str(g.venue?.phone, 60),
            booking_label: str(g.venue?.booking_label, 120), booking_url: /^https?:\/\//.test(str(g.venue?.booking_url, 1000)) ? str(g.venue?.booking_url, 1000) : "",
            details: str(g.venue?.details, 3000),
          },
          days: (Array.isArray(g.days) ? g.days : []).slice(0, 6).map((d: any) => ({
            label: str(d?.label, 120),
            items: (Array.isArray(d?.items) ? d.items : []).slice(0, 40).map((i: any) => ({
              time: str(i?.time, 60), title: str(i?.title, 200), location: str(i?.location, 200), dress: str(i?.dress, 200), details: str(i?.details, 1500),
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
        const rows = b.resend_all
          ? await sql`select id from vision_board.registrations where event_year = (select event_year from vision_board.settings where id = 1) and status = 'paid' order by created_at`
          : await sql`select id from vision_board.registrations where event_year = (select event_year from vision_board.settings where id = 1) and status = 'paid' and agenda_link_sent_at is null order by created_at`;
        const ids = rows.map((r: { id: string }) => r.id);
        // @ts-ignore EdgeRuntime is provided by Supabase
        EdgeRuntime.waitUntil((async () => { for (const id of ids) { await sendKind(id, "agenda", "team"); await new Promise((r) => setTimeout(r, 400)); } })());
        return json({ ok: true, queued: ids.length });
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
