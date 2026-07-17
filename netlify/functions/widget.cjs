const { baseHeaders, isSupabaseConfigured, json, restFilter, supabaseRequest } = require("./_shared.cjs");

function scriptResponse(event, body) {
  return {
    statusCode: 200,
    headers: {
      ...baseHeaders(event, { contentType: "application/javascript; charset=utf-8", cacheControl: "public, max-age=300" }),
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin"
    },
    body
  };
}

function serialize(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function clientScript(stories) {
  return `(() => {
  const stories = ${serialize(stories)};
  const source = document.currentScript;
  if (!source || source.dataset.vouchforgeMounted === "true") return;
  source.dataset.vouchforgeMounted = "true";
  const host = document.createElement("div");
  host.setAttribute("data-vouchforge-widget", "true");
  source.parentNode.insertBefore(host, source.nextSibling);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = ":host{all:initial}.vf-card{box-sizing:border-box;max-width:680px;padding:28px;border:1px solid #dce3ec;border-radius:8px;background:#fff;color:#0e1626;font-family:Inter,ui-sans-serif,system-ui,sans-serif;box-shadow:0 14px 35px rgba(15,34,58,.08)}.vf-kicker{display:flex;align-items:center;gap:8px;color:#0b6eea;font-size:12px;font-weight:750;letter-spacing:.03em;text-transform:uppercase}.vf-mark{display:grid;place-items:center;width:22px;height:22px;border-radius:5px;background:#063544;color:#fff;font-size:12px}.vf-quote{margin:18px 0 22px;font-size:20px;font-weight:700;line-height:1.45}.vf-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;color:#627086;font-size:13px}.vf-controls{display:flex;gap:6px}.vf-controls button{display:grid;place-items:center;width:30px;height:30px;border:1px solid #dce3ec;border-radius:6px;background:#fff;color:#24364d;cursor:pointer}.vf-empty{color:#627086;font-size:15px;line-height:1.5}";
  const card = document.createElement("section");
  card.className = "vf-card";
  root.append(style, card);
  if (!stories.length) {
    const empty = document.createElement("p");
    empty.className = "vf-empty";
    empty.textContent = "Approved customer stories will appear here.";
    card.append(empty);
    return;
  }
  let index = 0;
  const kicker = document.createElement("div"); kicker.className = "vf-kicker";
  const mark = document.createElement("span"); mark.className = "vf-mark"; mark.textContent = "V";
  const label = document.createElement("span"); label.textContent = "Customer proof";
  kicker.append(mark, label);
  const quote = document.createElement("blockquote"); quote.className = "vf-quote";
  const footer = document.createElement("footer"); footer.className = "vf-footer";
  const author = document.createElement("span");
  const controls = document.createElement("div"); controls.className = "vf-controls";
  const previous = document.createElement("button"); previous.type = "button"; previous.setAttribute("aria-label", "Previous customer story"); previous.textContent = "<";
  const next = document.createElement("button"); next.type = "button"; next.setAttribute("aria-label", "Next customer story"); next.textContent = ">";
  controls.append(previous, next); footer.append(author, controls); card.append(kicker, quote, footer);
  const render = () => { const story = stories[index]; quote.textContent = '"' + story.body + '"'; author.textContent = story.author || "Approved customer"; };
  previous.addEventListener("click", () => { index = (index - 1 + stories.length) % stories.length; render(); });
  next.addEventListener("click", () => { index = (index + 1) % stories.length; render(); });
  render();
})();`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(event, 405, { ok: false, error: "Method not allowed." }, { Allow: "GET" });
  const workspaceId = event.queryStringParameters?.workspaceId || "";
  if (!/^[a-z0-9_-]{3,80}$/i.test(workspaceId)) return scriptResponse(event, clientScript([]));
  try {
    if (!isSupabaseConfigured()) return scriptResponse(event, clientScript([]));
    const rows = await supabaseRequest(
      `/rest/v1/ai_assets?select=title,body&workspace_id=eq.${restFilter(workspaceId)}&asset_type=eq.testimonial&status=eq.published&is_public=is.true&order=published_at.desc&limit=8`
    );
    const stories = Array.isArray(rows)
      ? rows.map((row) => ({
          author: String(row.title || "Approved customer").replace(/^Testimonial\\s*-\\s*/i, "").slice(0, 120),
          body: String(row.body || "").slice(0, 800)
        })).filter((story) => story.body.length > 0)
      : [];
    return scriptResponse(event, clientScript(stories));
  } catch {
    return scriptResponse(event, clientScript([]));
  }
};
