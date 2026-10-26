import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 3, prepare: false });
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
const KINDS = ["hold", "waitlist", "offer", "paid"] as const;
type Kind = typeof KINDS[number];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function azTime(iso: string | null) {
  if (!iso) return "within 72 hours";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " Arizona time";
}

// ---------- email rendering ----------
type Tpl = { subject: string; heading: string; body: string };
type Guest = { id: string; first_name: string; last_name: string; email: string; code: string; amount: number; hold_expires_at: string | null };
type Settings = { zelle_to: string | null; hotel_code: string | null; email_templates: Record<string, Tpl>; mailer_url: string | null; mailer_token: string | null };

function fill(s: string, g: Guest, st: Settings) {
  const v: Record<string, string> = {
    first_name: g.first_name, last_name: g.last_name, code: g.code,
    amount: "$" + Number(g.amount).toLocaleString(), deadline: azTime(g.hold_expires_at),
    zelle_to: st.zelle_to || "info@schumacherliving.com",
    hotel_code: st.hotel_code || "[hotel discount code]",
    payment_link: `${SITE}/vision-board/pay?r=${g.id}`,
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
  const [s] = await sql`select zelle_to, hotel_code, email_templates, mailer_url, mailer_token from vision_board.settings where id = 1`;
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
    where id = ${id}`;
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
      const [row] = await sql`select vision_board.public_status() as s`;
      return json(row.s);
    }

    if (req.method === "GET" && action === "guest") {
      const id = clean(url.searchParams.get("r"), 40);
      if (!UUID.test(id)) return json({ ok: false }, 404);
      const [row] = await sql`select vision_board.guest_view(${id}::uuid) as g`;
      return json(row.g, row.g.ok ? 200 : 404);
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
      const missing = Object.entries(f).filter(([k, v]) => k !== "street2" && !v).map(([k]) => k);
      if (missing.length) return json({ ok: false, error: "missing", fields: missing }, 400);
      if (!EMAIL.test(f.email)) return json({ ok: false, error: "email" }, 400);
      if (f.phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "phone" }, 400);
      const [row] = await sql`select vision_board.register(${f.first}, ${f.last}, ${f.email}, ${f.phone},
        ${f.street}, ${f.street2}, ${f.city}, ${f.state}, ${f.zip}, ${f.company}) as r`;
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
