const ICON = { physics: "F=ma", chemistry: "H₂O", math: "∑" };
const SUBJ = { physics: "পদার্থবিজ্ঞান", chemistry: "রসায়ন", math: "গণিত" };
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const load = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch (e) {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
};
let quizzes = [],
  session = null,
  token = localStorage.getItem("sp_token") || "";
async function api(method, url, body) {
  try {
    const r = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: d };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: { error: "সার্ভারের সাথে যোগাযোগ হচ্ছে না।" },
    };
  }
}
const isAdmin = () => session && session.role === "admin";
function setSession(d) {
  token = d.token;
  try {
    localStorage.setItem("sp_token", token);
  } catch (e) {}
  session = { u: d.u, role: d.role, name: d.name || "" };
}
function clearSession() {
  token = "";
  try {
    localStorage.removeItem("sp_token");
  } catch (e) {}
  session = null;
}
let result = null;
let draft = null,
  answers = {},
  submitted = false;

function nav() {
  const h = location.hash,
    yr = new Date()
      .getFullYear()
      .toLocaleString("bn-BD", { useGrouping: false });
  const A = (href, on, txt, cls = "") =>
    `<a class="nav ${cls} ${on ? "on" : ""}" href="${href}">${txt}</a>`;
  const nm = session ? esc(session.name || session.u) : "";
  const subs = Object.keys(SUBJ);
  $("#top").innerHTML =
    `<div class="bar"><a class="logo" href="#/home"><span class="mark">একাডেমিক-সমাধান</span></a>` +
    (session
      ? `<button class="burger" id="bg" aria-label="মেনু" aria-expanded="false"><i></i><i></i><i></i></button>
   <nav class="links" id="lk">` +
        A("#/home", h.includes("home"), "হোম") +
        subs.map((k) => A("#/s/" + k, h === "#/s/" + k, SUBJ[k])).join("") +
        A(
          "#/results",
          h.startsWith("#/result"),
          isAdmin() ? "সব ফলাফল" : "আমার ফলাফল",
        ) +
        `<span class="sp"></span>` +
        A(
          "#/profile",
          h === "#/profile",
          `<span class="av">${esc((session.name || session.u).trim().charAt(0).toUpperCase())}</span>${nm}${isAdmin() ? " <small>(অ্যাডমিন)</small>" : ""}`,
          "prof",
        ) +
        A("#/logout", false, "লগআউট", "out") +
        `</nav>`
      : "") +
    `</div>`;
  const hd = $("#top"),
    bg = $("#bg");
  if (bg) {
    bg.onclick = () => {
      const o = hd.classList.toggle("open");
      bg.setAttribute("aria-expanded", o);
    };
    document.querySelectorAll("#lk a").forEach((x) =>
      x.addEventListener("click", () => {
        hd.classList.remove("open");
        bg.setAttribute("aria-expanded", "false");
      }),
    );
  }
  $("#foot").innerHTML =
    (session
      ? `<div class="fwrap"><div class="fcol fbrand"><a class="logo" href="#/home"><span class="mark">একাডেমিক-সমাধান</span></a>
   <p>পদার্থবিজ্ঞান, রসায়ন ও গণিতের কুইজ দিয়ে নিজেকে যাচাই করুন। একাডেমিক!</p></div>
   <div class="fcol"><h3>বিষয়</h3>${subs.map((k) => `<a href="#/s/${k}">${SUBJ[k]}</a>`).join("")}</div>
   <div class="fcol"><h3>পোর্টাল</h3><a href="#/home">হোম</a><a href="#/results">${isAdmin() ? "সব ফলাফল" : "আমার ফলাফল"}</a><a href="#/profile">প্রোফাইল</a><a href="#/logout">লগআউট</a></div></div>`
      : "") +
    `<div class="fbar"><span>© ${yr} একাডেমিক-সমাধান অনলাইন পোর্টাল</span>${session ? '<button class="totop" id="tt">↑ উপরে যান</button>' : ""}</div>`;
  if ($("#tt"))
    $("#tt").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
}
async function render() {
  const parts = (location.hash.slice(2) || "home").split("/");
  const [page, arg] = parts;
  if (page === "logout") {
    await api("POST", "/api/logout");
    clearSession();
    location.hash = "#/login";
    return;
  }
  if (token && !session) {
    const r = await api("GET", "/api/me");
    if (r.ok)
      session = { u: r.data.u, role: r.data.role, name: r.data.name || "" };
    else clearSession();
  }
  if (!session && page !== "login") {
    location.hash = "#/login";
    return;
  }
  if (session) {
    const r = await api("GET", "/api/quizzes");
    if (r.status === 401) {
      clearSession();
      location.hash = "#/login";
      return;
    }
    quizzes = r.data || [];
  }
  nav();
  const pages = {
    result: pReview,
    profile: pProfile,
    results: pResults,
    login: pLogin,
    home: pHome,
    s: pSubject,
    quiz: pQuiz,
    edit: pEdit,
    new: pNew,
  };
  (pages[page] || pHome)(arg);
  window.scrollTo(0, 0);
}
function pLogin() {
  $("#app").innerHTML =
    `<div class="card login"><div class="mark big">একাডেমিক-সমাধান</div><h1>লগইন</h1><p class="mute">কুইজ দিতে অ্যাকাউন্টে ঢুকুন।</p>
  <label for="u">ইউজারনেম</label><input id="u" autocomplete="username">
  <label for="p">পাসওয়ার্ড</label><input id="p" type="password" autocomplete="current-password">
  <p class="msg" id="m" role="alert"></p>
  <div class="row"><button class="btn pri" id="li">লগইন করুন</button><button class="btn" id="rg">নতুন অ্যাকাউন্ট খুলুন</button></div>`;
  const get = () => ({ u: $("#u").value.trim(), p: $("#p").value });
  const go = async (path) => {
    const { u, p } = get();
    if (!u) {
      $("#m").textContent = "ইউজারনেম লিখুন।";
      $("#u").focus();
      return;
    }
    if (!p) {
      $("#m").textContent = "পাসওয়ার্ড লিখুন।";
      $("#p").focus();
      return;
    }
    if (path === "/api/register" && u.length < 3) {
      $("#m").textContent = "ইউজারনেম কমপক্ষে ৩ অক্ষরের দিন।";
      $("#u").focus();
      return;
    }
    if (path === "/api/register" && p.length < 4) {
      $("#m").textContent = "পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের দিন।";
      $("#p").focus();
      return;
    }
    $("#m").textContent = "অপেক্ষা করুন...";
    const r = await api("POST", path, { u, p });
    if (!r.ok) {
      $("#m").textContent = r.data.error || "সমস্যা হয়েছে।";
      return;
    }
    setSession(r.data);
    location.hash = "#/home";
    render();
  };
  $("#li").onclick = () => go("/api/login");
  [$("#u"), $("#p")].forEach(
    (e) =>
      (e.onkeydown = (ev) => {
        if (ev.key === "Enter") go("/api/login");
      }),
  );
  $("#rg").onclick = () => go("/api/register");
}
async function pProfile() {
  const r = await api("GET", "/api/profile");
  if (!r.ok) {
    location.hash = "#/login";
    return;
  }
  const d = r.data,
    admin = d.role === "admin";
  $("#app").innerHTML = `<h1>আমার প্রোফাইল</h1><div class="grid">
  <div class="card"><h2>তথ্য</h2>
   <p class="mute" style="margin:0">ইউজারনেম</p><p style="margin:0 0 8px"><b>${esc(d.u)}</b> <span class="tag">${admin ? "অ্যাডমিন" : "স্টুডেন্ট"}</span></p>
   <p class="mute" style="margin:0">যোগ দিয়েছেন</p><p style="margin:0 0 8px">${d.created ? new Date(d.created).toLocaleDateString("bn-BD") : "—"}</p>
   ${admin ? "" : `<p class="mute" style="margin:0">কুইজ দিয়েছেন</p><p style="margin:0 0 8px"><b>${d.attempts}</b> বার · গড় <b>${d.avg}%</b></p>`}
   <label for="nm">পুরো নাম</label><input id="nm" maxlength="40" value="${esc(d.name)}" placeholder="আপনার নাম লিখুন">
   <p class="msg" id="m1" role="alert"></p><button class="btn pri" id="sn">নাম সেভ করুন</button></div>
  <div class="card"><h2>পাসওয়ার্ড বদলান</h2>
   <label for="op">বর্তমান পাসওয়ার্ড</label><input id="op" type="password" autocomplete="current-password">
   <label for="np">নতুন পাসওয়ার্ড</label><input id="np" type="password" autocomplete="new-password">
   <label for="np2">নতুন পাসওয়ার্ড আবার</label><input id="np2" type="password" autocomplete="new-password">
   <p class="msg" id="m2" role="alert"></p><button class="btn pri" id="sp">পাসওয়ার্ড বদলান</button></div></div>`;
  $("#sn").onclick = async () => {
    const x = await api("PUT", "/api/profile", { name: $("#nm").value });
    if (x.ok) {
      session.name = x.data.name;
      nav();
      $("#m1").style.color = "var(--ok)";
      $("#m1").textContent = "সেভ হয়েছে।";
    } else {
      $("#m1").style.color = "";
      $("#m1").textContent = x.data.error || "সেভ হয়নি।";
    }
  };
  $("#sp").onclick = async () => {
    const m = $("#m2");
    m.style.color = "";
    if ($("#np").value !== $("#np2").value) {
      m.textContent = "দুটি নতুন পাসওয়ার্ড মিলছে না।";
      return;
    }
    const x = await api("PUT", "/api/password", {
      oldPass: $("#op").value,
      newPass: $("#np").value,
    });
    if (x.ok) {
      m.style.color = "var(--ok)";
      m.textContent = "পাসওয়ার্ড বদলানো হয়েছে।";
      ["#op", "#np", "#np2"].forEach((i) => ($(i).value = ""));
    } else m.textContent = x.data.error || "বদলানো যায়নি।";
  };
}
/* ---------- চার্ট (বাইরের কোনো লাইব্রেরি ছাড়া, SVG) ---------- */
const bn = (n) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[d]);
const COL = { physics: "#2563eb", chemistry: "#0f9d76", math: "#8b5cf6" };
const pct = (x) => Math.round((x.score / x.total) * 100);
const avgOf = (l) =>
  l.length ? Math.round(l.reduce((a, x) => a + pct(x), 0) / l.length) : 0;
function barChart(rows) {
  const keys = Object.keys(SUBJ),
    W = 360,
    H = 230,
    L = 34,
    B = 36,
    T = 14,
    ch = H - B - T,
    bw = 56,
    gap = (W - L - 10 - bw * 3) / 4;
  let s = `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="বিষয়ভিত্তিক গড় স্কোর">`;
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = T + ch - (ch * v) / 100;
    s += `<line x1="${L}" x2="${W - 6}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${bn(v)}</text>`;
  });
  keys.forEach((k, i) => {
    const l = rows.filter((x) => x.subject === k),
      v = avgOf(l),
      h = (ch * v) / 100,
      x = L + gap * (i + 1) + bw * i,
      y = T + ch - h;
    s += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, l.length ? 2 : 0)}" rx="8" fill="${COL[k]}"><title>${SUBJ[k]}: ${bn(v)}% (${bn(l.length)}টি চেষ্টা)</title></rect>
     <text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" class="vl">${l.length ? bn(v) + "%" : "—"}</text>
     <text x="${x + bw / 2}" y="${H - 14}" text-anchor="middle">${SUBJ[k]}</text>`;
  });
  return s + "</svg>";
}
function donut(rows) {
  const ok = rows.reduce((a, x) => a + x.score, 0),
    all = rows.reduce((a, x) => a + x.total, 0),
    bad = all - ok,
    C = 2 * Math.PI * 60,
    p = all ? ok / all : 0;
  return `<div class="donutbox"><svg class="ch donut" viewBox="0 0 160 160" role="img" aria-label="সঠিক ও ভুল উত্তরের অনুপাত">
   <circle cx="80" cy="80" r="60" fill="none" stroke="${all ? "#d64545" : "var(--line)"}" stroke-width="22"/>
   ${all ? `<circle cx="80" cy="80" r="60" fill="none" stroke="#16a34a" stroke-width="22" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 80 80)"/>` : ""}
   <text x="80" y="82" text-anchor="middle" class="big">${all ? bn(Math.round(p * 100)) + "%" : "—"}</text><text x="80" y="101" text-anchor="middle">সঠিক</text></svg>
   <ul class="legend"><li><i style="background:#16a34a"></i>সঠিক উত্তর <b>${bn(ok)}</b></li><li><i style="background:#d64545"></i>ভুল উত্তর <b>${bn(bad)}</b></li><li><span class="mute">মোট প্রশ্ন ${bn(all)}</span></li></ul></div>`;
}
function lineChart(rows) {
  const pts = rows.slice(0, 12).reverse(); // পুরোনো → নতুন
  if (!pts.length) return '<p class="mute">কোনো চেষ্টা নেই।</p>';
  const W = 360,
    H = 210,
    L = 34,
    R = 14,
    T = 14,
    B = 30,
    cw = W - L - R,
    chh = H - T - B,
    n = pts.length;
  const X = (i) => L + (n === 1 ? cw / 2 : (cw * i) / (n - 1)),
    Y = (v) => T + chh - (chh * v) / 100;
  let s = `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="সময়ের সাথে স্কোরের অগ্রগতি"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1" stop-opacity=".35"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>`;
  [0, 50, 100].forEach(
    (v) =>
      (s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${bn(v)}</text>`),
  );
  if (n > 1) {
    const line = pts.map((x, i) => `${X(i)},${Y(pct(x))}`).join(" ");
    s += `<polygon points="${X(0)},${Y(0)} ${line} ${X(n - 1)},${Y(0)}" fill="url(#ag)"/><polyline points="${line}" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  pts.forEach(
    (x, i) =>
      (s += `<circle cx="${X(i)}" cy="${Y(pct(x))}" r="5" fill="${COL[x.subject] || "#6366f1"}" stroke="#fff" stroke-width="2"><title>${esc(x.title)}: ${bn(pct(x))}%</title></circle><text x="${X(i)}" y="${H - 10}" text-anchor="middle">${bn(i + 1)}</text>`),
  );
  return s + "</svg>";
}
function prog(label, v, color, right) {
  return `<div class="pg"><div class="pgt"><span>${label}</span><b>${right}</b></div><div class="pgb"><i style="width:${v}%;background:${color}"></i></div></div>`;
}
function charts(rows, admin) {
  const best = rows.length ? Math.max(...rows.map(pct)) : 0;
  const stats = [
    ["চেষ্টা", bn(rows.length)],
    ["গড় স্কোর", bn(avgOf(rows)) + "%"],
    ["সর্বোচ্চ স্কোর", bn(best) + "%"],
    admin
      ? ["ব্যবহারকারী", bn(new Set(rows.map((x) => x.u)).size)]
      : ["সঠিক উত্তর", bn(rows.reduce((a, x) => a + x.score, 0))],
  ];
  let side;
  if (admin) {
    // সেরা ৫ জন
    const g = {};
    rows.forEach((x) => {
      (g[x.u] = g[x.u] || []).push(x);
    });
    const top = Object.entries(g)
      .map(([u, l]) => ({ u, a: avgOf(l), n: l.length }))
      .sort((a, b) => b.a - a.a)
      .slice(0, 5);
    side =
      `<h2>সেরা ব্যবহারকারী (গড় স্কোর)</h2>` +
      (top.length
        ? top
            .map((t) =>
              prog(
                esc(t.u),
                t.a,
                "linear-gradient(90deg,#6366f1,#14b8a6)",
                bn(t.a) + "% · " + bn(t.n) + "টি",
              ),
            )
            .join("")
        : '<p class="mute">এখনো কোনো ফলাফল নেই।</p>');
  } else {
    // কোন বিষয়ে কত কুইজ সম্পন্ন
    side =
      `<h2>অগ্রগতি — কুইজ সম্পন্ন</h2>` +
      Object.keys(SUBJ)
        .map((k) => {
          const tot = quizzes.filter((q) => q.subject === k),
            done = tot.filter((q) =>
              rows.some((r) => r.quiz_id === q.id),
            ).length;
          return prog(
            SUBJ[k],
            tot.length ? Math.round((done / tot.length) * 100) : 0,
            COL[k],
            bn(done) + "/" + bn(tot.length) + "টি",
          );
        })
        .join("");
  }
  return `<div class="stats">${stats.map(([a, b]) => `<div class="card st"><span class="mute">${a}</span><b>${b}</b></div>`).join("")}</div>
  <div class="charts">
   <div class="card"><h2>বিষয়ভিত্তিক গড় স্কোর (%)</h2>${barChart(rows)}</div>
   <div class="card"><h2>সঠিক বনাম ভুল উত্তর</h2>${donut(rows)}</div>
   <div class="card"><h2>স্কোরের অগ্রগতি (শেষ ${bn(Math.min(rows.length, 12) || 0)}টি চেষ্টা)</h2>${lineChart(rows)}<div class="mute" style="font-size:.85rem">বিন্দুর রং = বিষয়, ডানদিকে সবচেয়ে নতুন চেষ্টা</div></div>
   <div class="card">${side}</div></div>`;
}
async function pReview(id) {
  const r = await api("GET", "/api/results/" + id);
  const back = '<a class="btn" href="#/results">← ফলাফল তালিকা</a>';
  if (!r.ok) {
    const old = r.status === 404 && r.data.error === "পাওয়া যায়নি।";
    $("#app").innerHTML =
      `<h1>ফলাফল</h1><div class="card"><p class="msg">${esc(r.data.error || "লোড হয়নি")}</p>${old ? '<p class="mute">সার্ভার এখনো পুরোনো সংস্করণে চলছে। নতুন server.js বসিয়ে সার্ভার বন্ধ করে আবার <b>node server.js</b> চালান।</p>' : ""}${back}</div>`;
    return;
  }
  const d = r.data;
  if (!d.questions || !d.answers) {
    $("#app").innerHTML =
      `<h1>${esc(d.title)}</h1><div class="card"><p class="mute">এই চেষ্টার উত্তর সংরক্ষিত নেই (এটি উত্তর সেভ করার সুবিধা আসার আগের)। স্কোর: <b>${d.score}/${d.total}</b></p>${back}</div>`;
    return;
  }
  $("#app").innerHTML =
    `<div class="head ${d.subject}"><div class="hl"><div class="badge sm">${ICON[d.subject] || ""}</div><div><h1>${esc(d.title)}</h1>
   <span class="mute">${SUBJ[d.subject] || ""}${isAdmin() ? " · " + esc(d.u) : ""} · ${new Date(d.created).toLocaleString("bn-BD")}</span></div></div>${back}</div>
  <div class="${d.subject}"><div class="card" style="margin-bottom:14px"><div class="score">${d.score} / ${d.total}</div><span class="mute">সবুজ = সঠিক উত্তর, লাল = আপনার ভুল উত্তর</span></div>` +
    d.questions
      .map((x, i) => {
        const mine = d.answers[i];
        return (
          `<div class="q"><div class="qh"><span class="qn">${i + 1}</span><b>${esc(x.q)}</b></div>` +
          x.opts
            .map((o, j) => {
              const right = j === x.a,
                wrong = j === mine && !right;
              return `<div class="choice ${right ? "right" : wrong ? "wrong" : ""}" style="cursor:default"><span>${esc(o)}</span>${j === mine ? '<span class="tag" style="margin-left:auto">' + admin_or_me() + " উত্তর</span>" : ""}${right && j !== mine ? '<span class="tag" style="margin-left:auto">সঠিক উত্তর</span>' : ""}</div>`;
            })
            .join("") +
          (mine === -1
            ? '<div class="mute">এই প্রশ্নের উত্তর দেওয়া হয়নি।</div>'
            : "") +
          `</div>`
        );
      })
      .join("") +
    `</div>`;
  function admin_or_me() {
    return isAdmin() ? "তার" : "আপনার";
  }
}
async function pResults() {
  const r = await api("GET", "/api/results");
  if (!r.ok) {
    $("#app").innerHTML =
      `<h1>ফলাফল</h1><div class="card"><p class="msg">ফলাফল লোড হয়নি: ${esc(r.data.error || "অজানা সমস্যা")}</p><p class="mute">নতুন server.js বসিয়ে সার্ভার বন্ধ করে আবার <b>node server.js</b> চালান, তারপর পেজ রিফ্রেশ করুন।</p></div>`;
    return;
  }
  const rows = r.data;
  const admin = isAdmin();
  const draw = (f) => {
    const list = rows.filter((x) => !f || x.subject === f);
    const avg = list.length
      ? Math.round(
          list.reduce((a, x) => a + (x.score / x.total) * 100, 0) / list.length,
        )
      : 0;
    $("#tb").innerHTML = list.length
      ? list
          .map(
            (
              x,
            ) => `<tr>${admin ? `<td data-l="ব্যবহারকারী">${esc(x.u)}</td>` : ""}<td data-l="কুইজ">${esc(x.title)}</td><td data-l="বিষয়">${SUBJ[x.subject] || ""}</td>
      <td data-l="স্কোর"><b>${x.score}/${x.total}</b> <span class="mute">(${Math.round((x.score / x.total) * 100)}%)</span></td>
      <td data-l="সময়" class="mute">${new Date(x.created).toLocaleString("bn-BD")}</td><td data-l=""><a class="btn" href="#/result/${x.id}">উত্তর দেখুন</a></td></tr>`,
          )
          .join("")
      : `<tr><td colspan="6" class="mute">এখনো কোনো ফলাফল নেই।</td></tr>`;
    $("#sum").textContent = `মোট ${list.length}টি চেষ্টা · গড় ${avg}%`;
  };
  $("#app").innerHTML =
    `<div class="head"><div><h1>${admin ? "সবার ফলাফল" : "আমার ফলাফল"}</h1><span class="mute" id="sum"></span></div>
  <select id="sf" style="width:auto" autocomplete="off"><option value="">সব বিষয়</option>${Object.keys(
    SUBJ,
  )
    .map((k) => `<option value="${k}">${SUBJ[k]}</option>`)
    .join(
      "",
    )}</select></div>${charts(rows, admin)}<div class="sec">সব চেষ্টা</div>
  <div class="card" style="overflow-x:auto"><table class="tbl"><thead><tr>${admin ? "<th>ব্যবহারকারী</th>" : ""}<th>কুইজ</th><th>বিষয়</th><th>স্কোর</th><th>সময়</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
  $("#sf").onchange = (e) => draw(e.target.value);
  draw("");
}
function pHome() {
  const tot = quizzes.length,
    qs = quizzes.reduce((a, q) => a + q.questions.length, 0);
  $("#app").innerHTML =
    `<section class="hero"><h1>স্বাগতম, ${esc(session.name || session.u)} 👋</h1><p>পদার্থবিজ্ঞান, রসায়ন ও গণিতের কুইজ দিয়ে নিজেকে যাচাই করুন — একাডেমিক!</p>
  <div class="chips"><span class="chip">📚 ${tot}টি কুইজ</span><span class="chip">❓ ${qs}টি প্রশ্ন</span><span class="chip">৩টি বিষয়</span></div></section>
  <div class="sec">বিষয় বেছে নিন</div><div class="grid">` +
    Object.keys(SUBJ)
      .map((k) => {
        const n = quizzes.filter((q) => q.subject === k).length;
        return `<a class="card subj ${k}" href="#/s/${k}"><div class="badge">${ICON[k]}</div><b>${SUBJ[k]}</b><div class="mute">${n}টি কুইজ</div><span class="go">শুরু করুন →</span></a>`;
      })
      .join("") +
    `</div>`;
}
function pSubject(k) {
  if (!SUBJ[k]) return pHome();
  const list = quizzes.filter((q) => q.subject === k);
  $("#app").innerHTML =
    `<div class="head ${k}"><div class="hl"><div class="badge sm">${ICON[k]}</div><div><h1>${SUBJ[k]}</h1><span class="mute">${list.length}টি কুইজ</span></div></div>
  ${isAdmin() ? `<a class="btn pri" href="#/new/${k}">+ নতুন কুইজ</a>` : ""}</div>
  <div class="list ${k}">` +
    (list.length
      ? list
          .map(
            (
              q,
              n,
            ) => `<div class="card item"><div class="ti"><span class="no">${n + 1}</span><div><b>${esc(q.title)}</b><div class="mute">${q.questions.length}টি প্রশ্ন</div></div></div>
   <div class="row">${isAdmin() ? "" : `<a class="btn pri" href="#/quiz/${q.id}">কুইজ দিন</a>`}
   ${isAdmin() ? `<a class="btn" href="#/edit/${q.id}">এডিট</a><button class="btn del" data-d="${q.id}">ডিলিট</button>` : ""}</div></div>`,
          )
          .join("")
      : `<div class="card mute">এখনো কোনো কুইজ নেই।${isAdmin() ? " উপরে “নতুন কুইজ” চাপুন।" : ""}</div>`) +
    `</div>`;
  document.querySelectorAll("[data-d]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (confirm("এই কুইজ ডিলিট করবেন?")) {
          await api("DELETE", "/api/quizzes/" + b.dataset.d);
          render();
        }
      }),
  );
}
function pQuiz(id) {
  const q = quizzes.find((x) => x.id === id);
  if (!q) return pHome();
  if (isAdmin()) {
    location.hash = "#/s/" + q.subject;
    return;
  }
  if (answers._id !== id) {
    answers = { _id: id };
    submitted = false;
    result = null;
  }
  $("#app").innerHTML =
    `<div class="head ${q.subject}"><div><h1>${esc(q.title)}</h1><span class="mute">${SUBJ[q.subject]}</span></div></div><div class="${q.subject}">${submitted ? "" : '<div class="prog"><i id="pb"></i></div>'}` +
    q.questions
      .map(
        (x, i) =>
          `<div class="q"><div class="qh"><span class="qn">${i + 1}</span><b>${esc(x.q)}</b></div>` +
          x.opts
            .map((o, j) => {
              let c = "";
              if (submitted && result) {
                if (j === result.correct[i]) c = "right";
                else if (answers[i] === j) c = "wrong";
              }
              return `<label class="choice ${c}"><input type="radio" name="q${i}" value="${j}" ${answers[i] === j ? "checked" : ""} ${submitted ? "disabled" : ""}>${esc(o)}</label>`;
            })
            .join("") +
          `</div>`,
      )
      .join("") +
    (submitted && result
      ? `<div class="card"><div class="score">${result.score} / ${result.total}</div><div class="row"><button class="btn pri" id="re">আবার দিন</button><a class="btn" href="#/s/${q.subject}">ফিরে যান</a></div></div>`
      : `<button class="btn pri" id="sub">জমা দিন</button><p class="msg" id="m"></p>`) +
    `</div>`;
  document.querySelectorAll("input[type=radio]").forEach(
    (r) =>
      (r.onchange = () => {
        answers[+r.name.slice(1)] = +r.value;
        const pb = $("#pb");
        if (pb)
          pb.style.width =
            (Object.keys(answers).filter((k) => k !== "_id").length /
              q.questions.length) *
              100 +
            "%";
      }),
  );
  if ($("#sub"))
    $("#sub").onclick = async () => {
      const arr = q.questions.map((x, i) => answers[i] ?? -1);
      const r = await api("POST", "/api/quizzes/" + id + "/submit", {
        answers: arr,
      });
      if (!r.ok) {
        $("#m").textContent = r.data.error;
        return;
      }
      result = r.data;
      submitted = true;
      pQuiz(id);
    };
  if ($("#re"))
    $("#re").onclick = () => {
      answers = { _id: id };
      submitted = false;
      result = null;
      pQuiz(id);
    };
}
function pNew(k) {
  if (!isAdmin() || !SUBJ[k]) return pHome();
  draft = {
    id: uid(),
    subject: k,
    title: "",
    questions: [{ q: "", opts: ["", "", "", ""], a: 0 }],
    isNew: true,
  };
  editor();
}
function pEdit(id) {
  if (!isAdmin()) return pHome();
  const q = quizzes.find((x) => x.id === id);
  if (!q) return pHome();
  draft = JSON.parse(JSON.stringify(q));
  editor();
}
function readForm() {
  draft.title = $("#t").value;
  draft.subject = $("#sj").value;
  draft.questions = [...document.querySelectorAll(".q")].map((el, i) => ({
    q: el.querySelector(".qt").value,
    opts: [...el.querySelectorAll(".ot")].map((o) => o.value),
    a: +(el.querySelector("input[type=radio]:checked")?.value ?? 0),
  }));
}
function editor() {
  $("#app").innerHTML =
    `<div class="head ${draft.subject}"><h1>${draft.isNew ? "নতুন কুইজ" : "কুইজ এডিট"}</h1></div><div class="${draft.subject}">
  <label for="t">কুইজের শিরোনাম</label><input id="t" value="${esc(draft.title)}" placeholder="যেমন: নিউটনের গতিসূত্র">
  <label for="sj">বিষয়</label><select id="sj">${Object.keys(SUBJ)
    .map(
      (k) =>
        `<option value="${k}" ${k === draft.subject ? "selected" : ""}>${SUBJ[k]}</option>`,
    )
    .join("")}</select>
  <div id="qs">` +
    draft.questions
      .map(
        (x, i) =>
          `<div class="q"><div class="item"><b>প্রশ্ন ${i + 1}</b><button class="btn del" data-rm="${i}">প্রশ্ন মুছুন</button></div>
   <textarea class="qt" rows="2" placeholder="প্রশ্ন লিখুন">${esc(x.q)}</textarea>` +
          x.opts
            .map(
              (o, j) =>
                `<div class="opt"><input type="radio" name="a${i}" value="${j}" ${x.a === j ? "checked" : ""} title="সঠিক উত্তর"><input class="ot" value="${esc(o)}" placeholder="অপশন ${j + 1}"></div>`,
            )
            .join("") +
          `<div class="mute" style="font-size:.85rem">সঠিক উত্তরের পাশের রেডিও বাটন বেছে নিন।</div></div>`,
      )
      .join("") +
    `</div>
  <div class="row"><button class="btn" id="aq">+ আরও প্রশ্ন যোগ করুন</button><button class="btn pri" id="sv">সেভ করুন</button><a class="btn" href="#/s/${draft.subject}">বাতিল</a></div>
  <p class="msg" id="m"></p></div>`;
  $("#aq").onclick = () => {
    readForm();
    draft.questions.push({ q: "", opts: ["", "", "", ""], a: 0 });
    editor();
  };
  document.querySelectorAll("[data-rm]").forEach(
    (b) =>
      (b.onclick = () => {
        readForm();
        if (draft.questions.length > 1) {
          draft.questions.splice(+b.dataset.rm, 1);
          editor();
        } else $("#m").textContent = "কমপক্ষে একটি প্রশ্ন থাকতে হবে।";
      }),
  );
  $("#sv").onclick = async () => {
    readForm();
    if (!draft.title.trim()) {
      $("#m").textContent = "শিরোনাম দিন।";
      return;
    }
    if (
      draft.questions.some((x) => !x.q.trim() || x.opts.some((o) => !o.trim()))
    ) {
      $("#m").textContent = "সব প্রশ্ন ও অপশন পূরণ করুন।";
      return;
    }
    const { isNew, id, ...q } = draft;
    const r = isNew
      ? await api("POST", "/api/quizzes", q)
      : await api("PUT", "/api/quizzes/" + id, q);
    if (!r.ok) {
      $("#m").textContent = r.data.error || "সেভ হয়নি।";
      return;
    }
    location.hash = "#/s/" + q.subject;
  };
}
window.addEventListener("hashchange", render);
render();
