import postgres from "npm:postgres@3.4.4";

// Jennifer's Big 5-0: private RSVP tracker + party chat. Data lives in the big_50 schema.
// Same database, pooler, Gmail sender and team password as the Vision Board function.
const _direct = new URL(Deno.env.get("SUPABASE_DB_URL")!);
const sql = postgres({
  host: "aws-1-us-east-1.pooler.supabase.com", port: 6543, database: "postgres",
  user: "postgres.agnpwmdwofrdyqzttmlv", password: decodeURIComponent(_direct.password),
  ssl: "require", prepare: false, max: 2, idle_timeout: 10, connect_timeout: 10,
});
const SITE = "https://www.schumacherliving.com";
const SUPA = Deno.env.get("SUPABASE_URL")!;
const BUCKET = "vision-board-photos";

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
const bool = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";

function storageAuth(): Record<string, string> {
  const k = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return k.startsWith("sb_") ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` };
}

// ---------- email ----------
type Party = Record<string, any>;
type Target = { id: string; first_name: string; last_name: string; email: string; attending: boolean; plus_one: boolean; plus_one_name: string };

async function mailer() {
  const [s] = await sql`select mailer_url, mailer_token from vision_board.settings where id = 1`;
  return s as { mailer_url: string | null; mailer_token: string | null };
}
async function sendViaGmail(to: string, m: { subject: string; html: string; text: string }) {
  const st = await mailer();
  if (!st.mailer_url || !st.mailer_token) return { ok: false, error: "Gmail isn't connected yet" };
  const res = await fetch(st.mailer_url, {
    method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: st.mailer_token, to, subject: m.subject, html: m.html, text: m.text }),
  });
  const raw = await res.text();
  try { return JSON.parse(raw); } catch { return { ok: false, error: "Unexpected reply from Gmail script (" + res.status + ")" }; }
}

function whereLine(p: Party) {
  if (!p.location_name && !p.location_address) return "Location coming soon";
  return [p.location_name, p.location_address].filter(Boolean).join(", ");
}

function render(p: Party, g: Target, o: { heading: string; body: string; subject: string; button?: string; details?: boolean }) {
  const link = `${SITE}/big-50/party?r=${g.id}`;
  const v: Record<string, string> = { first_name: g.first_name, last_name: g.last_name, party_link: link };
  const fill = (s: string) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const subject = fill(o.subject), heading = fill(o.heading), body = fill(o.body);
  const serif = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
  const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const linkify = (h: string) => h.replace(LINK, (_m, t, u) => `<a href="${u}" style="color:#002349;text-decoration:underline">${t}</a>`);
  const paras = body.split(/\n\s*\n/).map((x) =>
    `<p style="margin:0 0 16px;font:16px/1.7 ${sans};color:#55585c">${linkify(esc(x)).replace(/\n/g, "<br>")}</p>`).join("");
  const row = (k: string, val: string) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e4e1da;font:14px ${sans};color:#9a968d;width:110px;vertical-align:top">${k}</td><td style="padding:10px 0;border-bottom:1px solid #e4e1da;font:16px ${sans};color:#14181d">${val}</td></tr>`;
  const details = o.details === false ? "" : `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 24px">
        ${row("When", esc(p.date_label) + "<br>" + esc(p.time_label))}
        ${row("Where", esc(whereLine(p)))}
        ${g.attending && g.plus_one ? row("Your +1", esc(g.plus_one_name || "Yes")) : ""}
      </table>`;
  const button = o.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px"><tr><td style="background:#002349">
        <a href="${link}" style="display:inline-block;padding:16px 30px;font:13px ${sans};letter-spacing:.16em;text-transform:uppercase;color:#ffffff;text-decoration:none">${esc(o.button)}</a>
      </td></tr></table>` : "";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f5f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff">
      <tr><td style="background:#002349;padding:28px 36px">
        <div style="font:12px ${sans};letter-spacing:.28em;color:#c9d3df;text-transform:uppercase">You're invited</div>
        <div style="font:italic 34px ${serif};color:#ffffff;margin-top:6px">${esc(p.title)}</div>
      </td></tr>
      <tr><td style="padding:36px 36px 16px">
        ${heading ? `<h1 style="margin:0 0 20px;font:400 32px/1.15 ${serif};color:#14181d">${esc(heading)}</h1>` : ""}
        ${paras}${details}${button}
      </td></tr>
    </table>
    <div style="font:11px/1.6 ${sans};color:#9a968d;max-width:600px;margin-top:16px">Questions? Just reply to this email.</div>
  </td></tr></table></body></html>`;
  const text = [heading, body.replace(LINK, "$1 ($2)"),
    o.details === false ? "" : `When: ${p.date_label}, ${p.time_label}\nWhere: ${whereLine(p)}` + (g.attending && g.plus_one ? `\nYour +1: ${g.plus_one_name || "Yes"}` : ""),
    o.button ? `${o.button}: ${link}` : ""].filter(Boolean).join("\n\n");
  return { subject, html, text };
}

function confirmEmail(p: Party, g: Target) {
  if (g.attending) return render(p, g, {
    subject: "You're on the list for " + p.title + " 🥂",
    heading: "You're on the list, {first_name}!",
    body: "I can't wait to celebrate with you.\n\nYour party page has the latest details (including the location once it's set) and a party chat where everyone can post pictures. Save this email so you can always find it.",
    button: "Open my party page",
  });
  return render(p, g, {
    subject: "Thanks for letting me know",
    heading: "You'll be missed, {first_name}!",
    body: "Thank you for letting me know. If your plans change, you can update your RSVP anytime from your party page.",
    button: "Change my RSVP", details: false,
  });
}
function linkEmail(p: Party, g: Target) {
  return render(p, g, {
    subject: "Your link for " + p.title,
    heading: "Here's your party page, {first_name}",
    body: g.attending ? "You're already on the list. Here's your personal link for the details and the party chat." : "Here's your personal link. You can change your RSVP there anytime.",
    button: "Open my party page", details: g.attending,
  });
}

async function target(id: string): Promise<Target | null> {
  const [row] = await sql`select big_50.email_target(${id}::uuid) as t`;
  return row.t as Target | null;
}
async function party(): Promise<Party> {
  const [row] = await sql`select big_50.public_info() as p`;
  return row.p as Party;
}
async function deliver(id: string, kind: string, by: string, build: (p: Party, g: Target) => { subject: string; html: string; text: string }, toOverride?: string) {
  try {
    const g = await target(id);
    if (!g || (!g.email && !toOverride)) return { ok: false, error: "No email address" };
    const p = await party();
    const result = await sendViaGmail(toOverride || g.email, build(p, g));
    if (!toOverride) await sql`select big_50.log_email(${id}::uuid, ${sql.json({ kind, by, at: new Date().toISOString(), ok: !!result.ok, error: result.ok ? undefined : String(result.error || "").slice(0, 200) })})`;
    return result;
  } catch (e) {
    console.error("email " + kind, e);
    return { ok: false, error: String(e).slice(0, 120) };
  }
}

async function uploadPhotos(list: unknown): Promise<string[] | { error: string }> {
  const photos: string[] = [];
  for (const d of (Array.isArray(list) ? list : []).slice(0, 4)) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ""));
    if (!m) return { error: "photo" };
    const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
    if (bytes.length > 1_900_000) return { error: "photo_too_big" };
    const path = `big-50/${crypto.randomUUID()}.jpg`;
    const up = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST", headers: { ...storageAuth(), "Content-Type": "image/jpeg", "cache-control": "31536000" }, body: bytes,
    });
    if (!up.ok) { console.error("photo upload", up.status, await up.text()); return { error: "upload" }; }
    photos.push(`${SUPA}/storage/v1/object/public/${BUCKET}/${path}`);
  }
  return photos;
}

function rsvpFields(b: any) {
  return {
    first: clean(b.first, 80), last: clean(b.last, 80), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 40),
    street: clean(b.street, 200), street2: clean(b.street2, 200), city: clean(b.city, 100), state: clean(b.state, 40), zip: clean(b.zip, 12),
    attending: bool(b.attending), plus_one: bool(b.plus_one), plus_one_name: clean(b.plus_one_name, 120), note: clean(b.note, 1000),
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "info";

    if (req.method === "GET" && action === "info") return json({ ok: true, party: await party() });

    if (req.method === "POST" && action === "rsvp") {
      const b = await req.json().catch(() => ({}));
      const f = rsvpFields(b);
      const missing = ["first", "last", "email", "phone"].filter((k) => !(f as any)[k]);
      if (f.attending) for (const k of ["street", "city", "state", "zip"]) if (!(f as any)[k]) missing.push(k);
      if (f.attending && f.plus_one && !f.plus_one_name) missing.push("plus_one_name");
      if (missing.length) return json({ ok: false, error: "missing", fields: missing }, 400);
      if (!EMAIL.test(f.email)) return json({ ok: false, error: "email" }, 400);
      if (f.phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "phone" }, 400);
      const [row] = await sql`select big_50.rsvp(${sql.json(f)}) as r`;
      const r = row.r;
      if (!r.ok) return json(r, 409);
      // @ts-ignore EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(r.duplicate ? deliver(r.id, "link", "auto", linkEmail) : deliver(r.id, "confirm", "auto", confirmEmail));
      // an RSVP that already exists never hands back its private link: it goes to that inbox instead
      return json(r.duplicate ? { ok: true, duplicate: true } : { ok: true, id: r.id });
    }

    if (req.method === "POST" && (action === "guest" || action === "update")) {
      const b = await req.json().catch(() => ({}));
      const id = clean(b.r, 40);
      if (!UUID.test(id)) return json({ ok: false, reason: "not_found" }, 404);
      if (action === "update") {
        const f = rsvpFields(b);
        if (f.attending && f.plus_one && !f.plus_one_name) return json({ ok: false, error: "plus_one_name" }, 400);
        const [before] = await sql`select big_50.email_target(${id}::uuid) as t`;
        const [row] = await sql`select big_50.update_rsvp(${id}::uuid, ${sql.json(f)}) as r`;
        // switching from "can't make it" to "attending" gets the welcome email with the details
        if (row.r.ok && before.t && !before.t.attending && f.attending) {
          // @ts-ignore EdgeRuntime is provided by Supabase
          EdgeRuntime.waitUntil(deliver(id, "confirm", "auto", confirmEmail));
        }
        return json(row.r, row.r.ok ? 200 : 404);
      }
      const [row] = await sql`select big_50.guest(${id}::uuid) as r`;
      return json(row.r, row.r.ok ? 200 : 404);
    }

    if (req.method === "POST" && action === "link") {
      const b = await req.json().catch(() => ({}));
      const email = clean(b.email, 200);
      if (EMAIL.test(email)) {
        const [row] = await sql`select big_50.find_by_email(${email}) as id`;
        // @ts-ignore EdgeRuntime is provided by Supabase
        if (row.id) EdgeRuntime.waitUntil(deliver(row.id, "link", "guest", linkEmail));
      }
      return json({ ok: true }); // same answer either way, so nobody can test who's on the list
    }

    // ---------- Chat ----------
    if (req.method === "POST" && action.startsWith("feed")) {
      const b = await req.json().catch(() => ({}));
      const id = clean(b.r, 40);
      if (!UUID.test(id)) return json({ ok: false }, 404);
      const pid = UUID.test(clean(b.post, 40)) ? clean(b.post, 40) : null;
      let row: any;
      if (action === "feed") {
        const before = b.before && !isNaN(Date.parse(b.before)) ? new Date(b.before).toISOString() : null;
        [row] = await sql`select big_50.feed_list(${id}::uuid, ${before}::timestamptz) as r`;
      } else if (action === "feed-thread") {
        if (!pid) return json({ ok: false }, 404);
        [row] = await sql`select big_50.feed_thread(${id}::uuid, ${pid}::uuid) as r`;
      } else if (action === "feed-post") {
        const v = await sql`select (big_50._viewer(${id}::uuid)).id as vid`;
        if (!v[0].vid) return json({ ok: false }, 403);
        const photos = await uploadPhotos(b.photos);
        if (!Array.isArray(photos)) return json({ ok: false, error: photos.error }, photos.error === "upload" ? 502 : 400);
        [row] = await sql`select big_50.feed_create(${id}::uuid, ${pid}::uuid, ${String(b.body ?? "").slice(0, 2000)}, ${photos}::text[]) as r`;
      } else if (action === "feed-react") {
        if (!pid) return json({ ok: false }, 404);
        [row] = await sql`select big_50.feed_react(${id}::uuid, ${pid}::uuid, ${clean(b.emoji, 16)}) as r`;
      } else if (action === "feed-delete") {
        if (!pid) return json({ ok: false }, 404);
        [row] = await sql`select big_50.feed_delete(${id}::uuid, ${pid}::uuid) as r`;
      } else if (action === "feed-poll") {
        const since = b.since && !isNaN(Date.parse(b.since)) ? new Date(b.since).toISOString() : null;
        [row] = await sql`select big_50.feed_poll(${id}::uuid, ${since}::timestamptz) as r`;
      } else if (action === "feed-seen") {
        [row] = await sql`select big_50.feed_seen(${id}::uuid) as r`;
      } else return json({ ok: false, error: "not_found" }, 404);
      return json(row.r, row.r.ok ? 200 : (["slow", "empty", "emoji"].includes(row.r.error) ? 400 : 403));
    }

    // ---------- Jennifer's team (same password as the Vision Board team page) ----------
    if (action.startsWith("team")) {
      const pw = req.headers.get("x-team-password") || "";
      const [chk] = await sql`select vision_board.check_password(${pw}) as ok`;
      if (!chk.ok) {
        await new Promise((r) => setTimeout(r, 1200));
        return json({ ok: false, error: "password" }, 401);
      }
      const b: any = req.method === "POST" ? await req.json().catch(() => ({})) : {};

      if (action === "team-list") {
        const [row] = await sql`select big_50.team_list() as d`;
        return json(row.d);
      }
      if (action === "team-settings" && req.method === "POST") {
        const p: Record<string, unknown> = {};
        for (const k of ["title", "date_label", "time_label", "location_name", "location_address", "location_note", "details", "gift_note", "charity_url", "charity_label"])
          if (k in b) p[k] = String(b[k] ?? "").trim();
        if (p.charity_url && !/^https?:\/\//i.test(String(p.charity_url))) p.charity_url = "https://" + p.charity_url;
        if ("rsvp_closed" in b) p.rsvp_closed = bool(b.rsvp_closed);
        if (b.app_closes_at && !isNaN(Date.parse(b.app_closes_at))) p.app_closes_at = new Date(b.app_closes_at).toISOString();
        const [row] = await sql`select big_50.team_settings_save(${sql.json(p)}) as d`;
        return json(row.d);
      }
      if (action === "team-add" && req.method === "POST") {
        const f = { ...rsvpFields(b), by: "team" };
        if (!f.first) return json({ ok: false, error: "missing", fields: ["first"] }, 400);
        if (f.email && !EMAIL.test(f.email)) return json({ ok: false, error: "email" }, 400);
        const [row] = await sql`select big_50.rsvp(${sql.json(f)}) as r`;
        if (row.r.duplicate) return json({ ok: false, error: "duplicate" }, 409);
        if (row.r.ok && f.email && bool(b.send_email)) await deliver(row.r.id, "confirm", "team", confirmEmail);
        return json(row.r, row.r.ok ? 200 : 409);
      }
      if (action === "team-guest-save" && req.method === "POST") {
        if (!UUID.test(clean(b.id, 40))) return json({ ok: false }, 400);
        if (b.email && !EMAIL.test(clean(b.email))) return json({ ok: false, error: "email" }, 400);
        const p: Record<string, unknown> = { id: clean(b.id, 40) };
        for (const k of ["first_name", "last_name", "email", "phone", "street", "street2", "city", "state", "zip", "plus_one_name"]) if (k in b) p[k] = clean(b[k], 200);
        if ("attending" in b) p.attending = bool(b.attending);
        p.plus_one = bool(b.plus_one);
        try {
          const [row] = await sql`select big_50.team_guest_save(${sql.json(p)}) as r`;
          return json(row.r);
        } catch (e) {
          if (String(e).includes("rsvps_email_once")) return json({ ok: false, error: "duplicate" }, 409);
          throw e;
        }
      }
      if (action === "team-guest-remove" && req.method === "POST") {
        if (!UUID.test(clean(b.id, 40))) return json({ ok: false }, 400);
        const [row] = await sql`select big_50.team_guest_remove(${clean(b.id, 40)}::uuid, ${b.remove !== false}) as r`;
        return json(row.r);
      }
      if (action === "team-resend" && req.method === "POST") {
        if (!UUID.test(clean(b.id, 40))) return json({ ok: false }, 400);
        return json(await deliver(clean(b.id, 40), "confirm", "team", confirmEmail));
      }
      // Jennifer's own email to her guests, sent a few at a time by the team page
      if (action === "team-email" && req.method === "POST") {
        const subject = clean(b.subject, 200), body = String(b.body ?? "").slice(0, 6000);
        if (!subject || !body.trim()) return json({ ok: false, error: "empty" }, 400);
        const build = (p: Party, g: Target) => render(p, g, { subject, heading: "", body, button: bool(b.button) ? "Open my party page" : undefined, details: bool(b.details) });
        if (b.test_to) {
          if (!EMAIL.test(clean(b.test_to))) return json({ ok: false, error: "email" }, 400);
          const [row] = await sql`select id from big_50.rsvps where is_test limit 1`;
          return json(await deliver(row.id, "custom", "team", build, clean(b.test_to)));
        }
        const ids = (Array.isArray(b.ids) ? b.ids : []).map((x: unknown) => clean(x, 40)).filter((x: string) => UUID.test(x)).slice(0, 8);
        const results: Record<string, unknown> = {};
        for (const id of ids) results[id] = await deliver(id, "custom", "team", build);
        return json({ ok: true, results });
      }
      if (action === "team-feed") {
        const [row] = await sql`select big_50.team_feed() as r`;
        return json({ ok: true, posts: row.r });
      }
      if (action === "team-feed-remove" && req.method === "POST") {
        const [row] = await sql`select big_50.team_feed_remove(${clean(b.id, 40)}::uuid) as r`;
        return json(row.r);
      }
    }
    return json({ ok: false, error: "not_found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: "server" }, 500);
  }
});
