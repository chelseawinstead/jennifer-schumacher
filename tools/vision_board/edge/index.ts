import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 3, prepare: false });
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("VB_EMAIL_FROM") || "Jennifer Schumacher <jennifer@schumacherliving.com>";
const REPLY_TO = Deno.env.get("VB_EMAIL_REPLY_TO") || "jennifer@schumacherliving.com";
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
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function azTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " Arizona time";
}

// ---------- email ----------
export function welcomeEmail(r: { id: string; first_name: string; code: string; status: string; hold_expires_at: string | null; price: number; zelle_to: string | null }) {
  const link = `${SITE}/vision-board/pay?r=${r.id}`;
  const serif = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
  const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const wait = r.status === "waitlist";
  const subject = wait
    ? "You're on the Vision Board Crew 2027 waitlist"
    : `You're in! Your Vision Board Crew seat is on hold (${r.code})`;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e4e1da;font:14px ${sans};color:#9a968d;width:130px;vertical-align:top">${k}</td><td style="padding:10px 0;border-bottom:1px solid #e4e1da;font:16px ${sans};color:#14181d">${v}</td></tr>`;

  const body = wait ? `
      <p style="margin:0 0 16px;font:16px/1.7 ${sans};color:#55585c">Thank you for your interest in Vision Board Crew 2027. All 50 seats are taken right now, so you're on the waitlist. There's nothing to pay.</p>
      <p style="margin:0 0 16px;font:16px/1.7 ${sans};color:#55585c">Unpaid seats are released after 72 hours, so spots do open up. If one does, we'll contact you in the order you joined.</p>
      <p style="margin:0 0 8px;font:16px/1.7 ${sans};color:#55585c">Your waitlist code is <strong style="color:#002349">${esc(r.code)}</strong>.</p>`
    : `
      <p style="margin:0 0 16px;font:16px/1.7 ${sans};color:#55585c">Congratulations on your RSVP for Vision Board Crew 2027! Your seat is on hold. To reserve it, send your payment by Zelle by <strong style="color:#14181d">${esc(azTime(r.hold_expires_at!))}</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 24px">
        ${row("Your code", `<span style="font:28px ${serif};color:#002349;letter-spacing:.04em">${esc(r.code)}</span>`)}
        ${row("Amount", "$" + Number(r.price).toLocaleString())}
        ${row("Zelle to", esc(r.zelle_to || "info@schumacherliving.com"))}
        ${row("Zelle memo", `${esc(r.code)}, so we can match your payment`)}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#002349">
        <a href="${link}" style="display:inline-block;padding:16px 30px;font:13px ${sans};letter-spacing:.16em;text-transform:uppercase;color:#ffffff;text-decoration:none">View my payment details</a>
      </td></tr></table>
      <p style="margin:24px 0 0;font:14px/1.7 ${sans};color:#55585c">Open your bank's app, choose Zelle, and send to the address above. If payment isn't received by the deadline, the seat is released to the next guest. Once it arrives, we'll email your confirmation and the ANdAZ room discount code.</p>`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f5f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff">
      <tr><td style="background:#002349;padding:28px 36px">
        <div style="font:20px ${serif};letter-spacing:.18em;color:#ffffff">JENNIFER SCHUMACHER</div>
        <div style="font:10px ${sans};letter-spacing:.28em;color:#9fb0c2;margin-top:4px;text-transform:uppercase">Russ Lyon Sotheby's International Realty</div>
      </td></tr>
      <tr><td style="padding:40px 36px 36px">
        <div style="font:12px ${sans};letter-spacing:.24em;text-transform:uppercase;color:#002349;margin-bottom:14px">Vision Board Crew 2027</div>
        <h1 style="margin:0 0 20px;font:400 34px/1.15 ${serif};color:#14181d">${wait ? "You're on the waitlist, " : "You're in, "}${esc(r.first_name)}.</h1>
        ${body}
      </td></tr>
      <tr><td style="padding:24px 36px;border-top:1px solid #e4e1da;font:14px/1.7 ${sans};color:#55585c">
        <strong style="color:#14181d">Friday &amp; Saturday, January 8&ndash;9, 2027</strong><br>
        ANdAZ Resort, 6114 N Scottsdale Rd, Scottsdale, AZ 85253<br><br>
        Questions? Reply to this email or call Jennifer at (480) 322-2593.
      </td></tr>
    </table>
    <div style="font:11px/1.6 ${sans};color:#9a968d;max-width:600px;margin-top:16px">Jennifer Schumacher · Russ Lyon Sotheby's International Realty · 6900 E. Camelback Rd., Suite 110, Scottsdale, AZ 85251</div>
  </td></tr></table></body></html>`;

  const text = wait
    ? `Hi ${r.first_name},\n\nYou're on the Vision Board Crew 2027 waitlist. All 50 seats are taken right now, so there's nothing to pay. If a seat opens, we'll contact you in the order you joined.\n\nYour waitlist code: ${r.code}\n\nQuestions? Reply to this email or call Jennifer at (480) 322-2593.`
    : `Hi ${r.first_name},\n\nCongratulations on your RSVP for Vision Board Crew 2027! Your seat is on hold.\n\nTo reserve it, send $${Number(r.price).toLocaleString()} by Zelle to ${r.zelle_to || "info@schumacherliving.com"} by ${azTime(r.hold_expires_at!)}.\nPut your code ${r.code} in the Zelle memo.\n\nYour payment details: ${link}\n\nIf payment isn't received by the deadline, the seat is released to the next guest.\n\nFriday & Saturday, January 8-9, 2027 · ANdAZ Resort, Scottsdale\nQuestions? Reply to this email or call Jennifer at (480) 322-2593.`;
  return { subject, html, text };
}

async function sendWelcome(code: string) {
  const [row] = await sql`select r.id, r.email, r.first_name, r.code, r.status, r.hold_expires_at, r.amount as price,
      r.welcome_email_sent_at, s.zelle_to from vision_board.registrations r cross join vision_board.settings s where r.code = ${code}`;
  if (!row || row.welcome_email_sent_at) return;
  if (!RESEND_KEY) { await sql`update vision_board.registrations set welcome_email_error = 'email not connected yet' where id = ${row.id}`; return; }
  const m = welcomeEmail({ ...row, hold_expires_at: row.hold_expires_at ? new Date(row.hold_expires_at).toISOString() : null });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [row.email], reply_to: REPLY_TO, subject: m.subject, html: m.html, text: m.text }),
    });
    if (res.ok) await sql`update vision_board.registrations set welcome_email_sent_at = now(), welcome_email_error = null where id = ${row.id}`;
    else await sql`update vision_board.registrations set welcome_email_error = ${("resend " + res.status + ": " + (await res.text())).slice(0, 300)} where id = ${row.id}`;
  } catch (e) {
    await sql`update vision_board.registrations set welcome_email_error = ${String(e).slice(0, 300)} where id = ${row.id}`;
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
      };
      const missing = Object.entries(f).filter(([k, v]) => k !== "street2" && !v).map(([k]) => k);
      if (missing.length) return json({ ok: false, error: "missing", fields: missing }, 400);
      if (!EMAIL.test(f.email)) return json({ ok: false, error: "email" }, 400);
      if (f.phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "phone" }, 400);
      const [row] = await sql`select vision_board.register(${f.first}, ${f.last}, ${f.email}, ${f.phone},
        ${f.street}, ${f.street2}, ${f.city}, ${f.state}, ${f.zip}) as r`;
      if (row.r.ok && !row.r.duplicate) {
        // send after responding so the guest never waits on the email service
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
      if (action === "team-action" && req.method === "POST") {
        const b = await req.json().catch(() => ({}));
        const [row] = await sql`select vision_board.team_action(${clean(b.id, 40)}::uuid, ${clean(b.action, 20)}, ${b.value == null ? null : clean(b.value, 2000)}) as r`;
        return json(row.r, row.r.ok ? 200 : 409);
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
