"use strict";

const HOST = "com.claude.sidepanel";
const MODES = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"];
const LOCAL_COMMANDS = [
  { name: "new", description: "Bắt đầu cuộc chat mới" },
  { name: "resume", description: "Mở lại cuộc chat cũ" },
  { name: "model", description: "Đổi model" },
  { name: "mode", description: "Đổi chế độ quyền" },
];

const $ = (id) => document.getElementById(id);
const els = {
  title: $("title"), sessionsBtn: $("sessions-btn"), newBtn: $("new-btn"), dot: $("status-dot"),
  drawer: $("drawer"), drawerSearch: $("drawer-search"), drawerList: $("drawer-list"),
  banner: $("banner"), scroller: $("scroller"), empty: $("empty"), cwd: $("cwd"), recentDirs: $("recent-dirs"),
  messages: $("messages"), working: $("working"), workingText: $("working-text"),
  slash: $("slash-menu"), input: $("input"), mode: $("mode"), model: $("model"),
  cwdChip: $("cwd-chip"), send: $("send"), sendIcon: $("send-icon"), stopIcon: $("stop-icon"),
};

const state = {
  port: null,
  connected: false,
  home: "",
  reqSeq: 0,
  waiting: new Map(), // request id -> resolve
  live: new Map(), // key -> session summary from daemon
  key: null, // session shown in the panel
  commands: [],
  models: [],
  history: [],
  slashItems: [],
  slashIndex: 0,
};

// ---------- connection ----------

function connect() {
  try {
    state.port = chrome.runtime.connectNative(HOST);
  } catch (err) {
    return showBanner(`Không mở được cầu nối: ${err.message}`, true);
  }
  state.port.onMessage.addListener(onMessage);
  state.port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message;
    state.connected = false;
    state.port = null;
    els.dot.className = "dot off";
    showBanner(reason?.includes("not found")
      ? "Chưa cài phần chạy trên máy. Mở Terminal ở thư mục claude-sidepanel và chạy: npm run setup"
      : `Mất kết nối với máy${reason ? ` (${reason})` : ""}.`, true);
  });
  request({ type: "hello" }).then(async (res) => {
    state.connected = true;
    state.home = res.home;
    els.dot.className = "dot on";
    hideBanner();
    for (const s of res.sessions) state.live.set(s.key, s);
    if (!els.cwd.value) els.cwd.value = (await getLocal("lastCwd")) || res.home;
    const target = state.key || (await getLocal("lastKey"));
    if (target && state.live.has(target)) attach(target);
  });
}

function post(msg) {
  if (!state.port) return false;
  state.port.postMessage(msg);
  return true;
}

function request(msg) {
  const id = ++state.reqSeq;
  return new Promise((resolve, reject) => {
    state.waiting.set(id, { resolve, reject });
    if (!post({ ...msg, id })) {
      state.waiting.delete(id);
      reject(new Error("Chưa kết nối"));
    }
  });
}

function onMessage(msg) {
  if (msg.id && state.waiting.has(msg.id)) {
    const w = state.waiting.get(msg.id);
    state.waiting.delete(msg.id);
    if (msg.type === "error") w.reject(new Error(msg.message));
    else w.resolve(msg);
    return;
  }
  switch (msg.type) {
    case "event":
      if (msg.key === state.key) renderEvent(msg.event, true);
      break;
    case "session":
      state.live.set(msg.session.key, msg.session);
      if (msg.session.key === state.key) syncSession(msg.session);
      if (!els.drawer.hidden) renderDrawer();
      break;
    case "closed":
      state.live.delete(msg.key);
      if (!els.drawer.hidden) renderDrawer();
      break;
    case "fatal":
      showBanner(msg.message, true);
      break;
    case "error":
      if (!msg.key || msg.key === state.key) notice(msg.message, "error");
      break;
  }
}

// ---------- sessions ----------

function resetView() {
  els.messages.textContent = "";
  view.cards.clear();
  view.liveText = null;
  view.permissionCards.clear();
}

function newChat() {
  state.key = null;
  setLocal("lastKey", null);
  resetView();
  els.empty.hidden = false;
  els.cwd.disabled = false;
  els.cwdChip.hidden = true;
  els.title.textContent = "Chat mới";
  setBusy(false);
  closeDrawer();
  els.input.focus();
}

function loadOpened(res) {
  state.key = res.session.key;
  setLocal("lastKey", state.key);
  state.live.set(res.session.key, res.session);
  resetView();
  els.empty.hidden = true;
  if (res.capabilities) applyCapabilities(res.capabilities);
  for (const ev of res.log) renderEvent(ev, false);
  syncSession(res.session);
  scrollToBottom(true);
}

async function attach(key) {
  closeDrawer();
  try {
    loadOpened(await request({ type: "attach", key }));
  } catch (err) {
    notice(err.message, "error");
  }
}

async function resume(item) {
  closeDrawer();
  resetView();
  els.empty.hidden = true;
  notice("Đang mở lại cuộc chat…");
  try {
    loadOpened(await request({
      type: "open", resume: item.sessionId, cwd: item.cwd,
      model: els.model.value || undefined, permissionMode: els.mode.value,
    }));
  } catch (err) {
    notice(err.message, "error");
  }
}

function syncSession(s) {
  els.title.textContent = s.title || "Chat mới";
  if (s.permissionMode && MODES.includes(s.permissionMode)) els.mode.value = s.permissionMode;
  if (s.model !== undefined) selectModel(s.model);
  els.cwdChip.hidden = false;
  els.cwdChip.textContent = shortPath(s.cwd);
  els.cwdChip.title = s.cwd;
  els.cwd.disabled = true;
  setBusy(s.busy && !s.ended);
  if (s.ended) notice("Phiên này đã dừng. Mở lại từ danh sách để tiếp tục.");
}

async function ensureSession() {
  if (state.key && state.live.get(state.key) && !state.live.get(state.key).ended) return state.key;
  const cwd = els.cwd.value.trim() || state.home;
  rememberDir(cwd);
  const res = await request({ type: "open", cwd, model: els.model.value || undefined, permissionMode: els.mode.value });
  loadOpened(res);
  return state.key;
}

// ---------- drawer ----------

async function openDrawer() {
  els.drawer.hidden = false;
  els.drawerSearch.value = "";
  renderDrawer();
  els.drawerSearch.focus();
  try {
    const res = await request({ type: "history", limit: 80 });
    state.history = res.sessions;
    renderDrawer();
  } catch (err) {
    notice(err.message, "error");
  }
}

function closeDrawer() {
  els.drawer.hidden = true;
}

function renderDrawer() {
  const q = els.drawerSearch.value.trim().toLowerCase();
  const match = (...parts) => !q || parts.some((p) => p && p.toLowerCase().includes(q));
  els.drawerList.textContent = "";

  const live = [...state.live.values()].filter((s) => !s.ended && match(s.title, s.cwd))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const liveIds = new Set(live.map((s) => s.sessionId));
  if (live.length) {
    els.drawerList.append(h("div", "drawer-head", "Đang chạy"));
    for (const s of live) {
      const tag = s.pending.length ? "cần duyệt" : s.busy ? "đang làm" : "";
      els.drawerList.append(drawerItem(s.title || "Chat mới", s.cwd, s.updatedAt, tag, () => attach(s.key), s.key === state.key));
    }
  }
  const past = state.history.filter((x) => !liveIds.has(x.sessionId) && match(x.customTitle, x.summary, x.firstPrompt, x.cwd));
  if (past.length) {
    els.drawerList.append(h("div", "drawer-head", "Gần đây"));
    for (const x of past) {
      els.drawerList.append(drawerItem(x.customTitle || x.summary || x.firstPrompt || x.sessionId, x.cwd, x.lastModified, "", () => resume(x)));
    }
  }
  if (!live.length && !past.length) els.drawerList.append(h("div", "drawer-empty", "Chưa có cuộc chat nào"));
}

function drawerItem(title, cwd, time, tag, onClick, active) {
  const item = h("button", "drawer-item" + (active ? " active" : ""));
  const top = h("div", "drawer-title", title);
  if (tag) top.append(h("span", "tag", tag));
  item.append(top, h("div", "drawer-meta", `${shortPath(cwd || "")} · ${ago(time)}`));
  item.onclick = onClick;
  return item;
}

// ---------- rendering ----------

const view = {
  cards: new Map(), // tool_use_id -> card
  permissionCards: new Map(), // reqId -> card
  liveText: null, // { el, text }
};

function renderEvent(ev, isLive) {
  switch (ev.type) {
    case "local_user":
      addUser(ev.text);
      break;
    case "history":
      renderHistory(ev);
      break;
    case "stream_event":
      renderStream(ev.event);
      break;
    case "assistant":
      renderAssistant(ev.message?.content || [], ev.parent_tool_use_id);
      break;
    case "user":
      renderToolResults(ev.message?.content);
      break;
    case "result":
      finishTurn(ev);
      break;
    case "system":
      renderSystem(ev);
      break;
    case "permission_request":
      renderPermission(ev);
      break;
    case "permission_resolved":
      resolvePermission(ev.reqId, ev.behavior);
      break;
    case "capabilities":
      applyCapabilities(ev);
      break;
    case "notice":
      notice(ev.text);
      break;
    case "daemon_error":
      notice(ev.message, "error");
      break;
  }
  if (isLive) scrollToBottom();
}

function renderHistory(ev) {
  const content = ev.message?.content;
  if (ev.role === "assistant") return renderAssistant(Array.isArray(content) ? content : [], ev.parent);
  if (ev.role !== "user") return;
  if (typeof content === "string") return addUserFromTranscript(content);
  if (Array.isArray(content)) {
    const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    if (text) addUserFromTranscript(text);
    renderToolResults(content);
  }
}

// Transcript user turns include wrapped command text; show what the person typed.
function addUserFromTranscript(text) {
  const cmd = text.match(/<command-name>([^<]*)<\/command-name>[\s\S]*?(?:<command-args>([^<]*)<\/command-args>)?/);
  if (cmd) return addUser(`${cmd[1]} ${cmd[2] || ""}`.trim());
  const out = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
  if (out) return addOutput(out[1]);
  if (/^<(system-reminder|local-command-caveat)/.test(text.trim())) return;
  addUser(text);
}

function addUser(text) {
  els.empty.hidden = true;
  const row = h("div", "msg user");
  row.append(h("div", "bubble", text));
  els.messages.append(row);
}

function addOutput(text) {
  const pre = h("pre", "cmd-output", stripAnsi(text));
  els.messages.append(pre);
}

function renderStream(e) {
  if (!e) return;
  if (e.type === "content_block_start" && e.content_block?.type === "text") {
    const el = h("div", "msg assistant prose");
    els.messages.append(el);
    view.liveText = { el, text: "" };
  } else if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && view.liveText) {
    view.liveText.text += e.delta.text;
    scheduleLiveRender();
  } else if (e.type === "content_block_start" && e.content_block?.type === "thinking") {
    els.workingText.textContent = "Đang suy nghĩ…";
  }
}

let liveFrame = 0;
function scheduleLiveRender() {
  if (liveFrame) return;
  liveFrame = requestAnimationFrame(() => {
    liveFrame = 0;
    if (view.liveText) {
      view.liveText.el.innerHTML = markdown(view.liveText.text);
      scrollToBottom();
    }
  });
}

function renderAssistant(blocks, parentId) {
  const parent = parentId ? view.cards.get(parentId) : null;
  for (const b of blocks) {
    if (parent) {
      if (b.type === "tool_use") parent.sub.append(toolCard(b, true).root);
      continue;
    }
    if (b.type === "text" && b.text?.trim()) {
      let el;
      if (view.liveText) {
        el = view.liveText.el;
        view.liveText = null;
      } else {
        el = h("div", "msg assistant prose");
        els.messages.append(el);
      }
      el.innerHTML = markdown(b.text);
      highlight(el);
    } else if (b.type === "thinking" && b.thinking?.trim()) {
      const d = h("details", "thinking");
      d.append(h("summary", "", "Suy nghĩ"), h("div", "thinking-body", b.thinking));
      els.messages.append(d);
    } else if (b.type === "tool_use") {
      els.messages.append(toolCard(b, false).root);
    }
  }
  if (!parent) els.workingText.textContent = "Đang làm…";
}

function toolCard(block, nested) {
  const root = h("details", "tool" + (nested ? " nested" : ""));
  const summary = h("summary");
  const status = h("span", "tool-status running");
  summary.append(status, h("span", "tool-name", toolLabel(block.name)), h("span", "tool-arg", toolArg(block.name, block.input || {})));
  const body = h("div", "tool-body");
  body.append(toolInput(block.name, block.input || {}));
  const sub = h("div", "tool-sub");
  const result = h("div", "tool-result");
  body.append(sub, result);
  root.append(summary, body);
  const card = { root, status, sub, result };
  view.cards.set(block.id, card);
  if (block.name === "TodoWrite") root.open = true;
  return card;
}

function renderToolResults(content) {
  if (!Array.isArray(content)) return;
  for (const b of content) {
    if (b.type !== "tool_result") continue;
    const card = view.cards.get(b.tool_use_id);
    if (!card) continue;
    card.status.className = "tool-status " + (b.is_error ? "error" : "done");
    const text = resultText(b.content);
    card.result.textContent = "";
    if (text) card.result.append(h("pre", b.is_error ? "error-text" : "", stripAnsi(text)));
  }
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c.type === "text" ? c.text : c.type === "image" ? "[ảnh]" : "")).join("\n");
}

function toolLabel(name) {
  if (name.startsWith("mcp__")) return name.split("__").slice(1).join(" › ");
  return name;
}

function toolArg(name, input) {
  const v = input.command || input.file_path || input.notebook_path || input.pattern || input.url || input.query
    || input.description || input.skill || input.prompt || "";
  const s = String(v);
  return name === "Bash" ? s.split("\n")[0] : s.includes("/") && !s.includes(" ") ? shortPath(s) : s.slice(0, 120);
}

function toolInput(name, input) {
  const wrap = h("div", "tool-input");
  if (name === "Bash") {
    wrap.append(h("pre", "code-line", "$ " + input.command));
  } else if (name === "Edit" || name === "MultiEdit") {
    const edits = input.edits || [{ old_string: input.old_string, new_string: input.new_string }];
    for (const e of edits) {
      wrap.append(h("pre", "diff del", prefixLines(e.old_string, "− ")), h("pre", "diff add", prefixLines(e.new_string, "+ ")));
    }
  } else if (name === "Write") {
    wrap.append(h("pre", "diff add", input.content || ""));
  } else if (name === "TodoWrite") {
    const ul = h("ul", "todos");
    for (const t of input.todos || []) {
      const mark = t.status === "completed" ? "☑" : t.status === "in_progress" ? "◐" : "☐";
      ul.append(h("li", t.status, `${mark} ${t.content}`));
    }
    wrap.append(ul);
  } else if (name === "ExitPlanMode" && input.plan) {
    const d = h("div", "prose");
    d.innerHTML = markdown(input.plan);
    wrap.append(d);
  } else if (Object.keys(input).length) {
    wrap.append(h("pre", "", JSON.stringify(input, null, 2)));
  }
  return wrap;
}

function renderPermission(req) {
  if (req.toolName === "AskUserQuestion") return renderQuestion(req);
  const card = h("div", "permission");
  card.append(h("div", "perm-title", `Claude muốn dùng ${toolLabel(req.toolName)}`));
  if (req.decisionReason) card.append(h("div", "perm-reason", req.decisionReason));
  card.append(toolInput(req.toolName, req.input || {}));
  const actions = h("div", "perm-actions");
  const allow = button("Cho phép", "primary", () => answer(req.reqId, { allow: true }));
  actions.append(allow);
  if (req.canAlwaysAllow) actions.append(button("Luôn cho phép", "", () => answer(req.reqId, { allow: true, always: true })));
  actions.append(button("Từ chối", "danger", () => answer(req.reqId, { allow: false })));
  card.append(actions);
  els.messages.append(card);
  view.permissionCards.set(req.reqId, card);
  allow.focus({ preventScroll: true });
}

function renderQuestion(req) {
  const card = h("div", "permission question");
  const picks = {};
  for (const q of req.input?.questions || []) {
    const block = h("div", "q-block");
    block.append(h("div", "perm-title", q.question));
    const opts = h("div", "q-options");
    const chosen = new Set();
    for (const o of q.options || []) {
      const b = button(o.label, "option", () => {
        if (!q.multiSelect) chosen.clear();
        chosen.has(o.label) ? chosen.delete(o.label) : chosen.add(o.label);
        for (const c of opts.children) c.classList.toggle("picked", chosen.has(c.dataset.label));
        picks[q.question] = [...chosen].join(", ");
      });
      b.dataset.label = o.label;
      if (o.description) b.title = o.description;
      opts.append(b);
    }
    const other = h("input", "q-other");
    other.placeholder = "Hoặc tự trả lời…";
    other.oninput = () => {
      if (other.value.trim()) picks[q.question] = other.value.trim();
    };
    block.append(opts, other);
    card.append(block);
  }
  const actions = h("div", "perm-actions");
  actions.append(
    button("Gửi trả lời", "primary", () => answer(req.reqId, { allow: true, answers: picks })),
    button("Bỏ qua", "", () => answer(req.reqId, { allow: false, message: "Người dùng bỏ qua câu hỏi" })),
  );
  card.append(actions);
  els.messages.append(card);
  view.permissionCards.set(req.reqId, card);
}

function answer(reqId, payload) {
  post({ type: "permission", key: state.key, reqId, ...payload });
}

function resolvePermission(reqId, behavior) {
  const card = view.permissionCards.get(reqId);
  if (!card) return;
  card.classList.add("resolved");
  for (const b of card.querySelectorAll("button, input")) b.disabled = true;
  card.querySelector(".perm-actions")?.replaceWith(h("div", "perm-done", behavior === "allow" ? "✓ Đã cho phép" : "✕ Đã từ chối"));
}

function renderSystem(ev) {
  if (ev.subtype === "init") {
    if (ev.model) selectModel(ev.model);
    if (ev.permissionMode) els.mode.value = ev.permissionMode;
    if (ev.slash_commands && !state.commands.length) state.commands = ev.slash_commands.map((name) => ({ name }));
  } else if (ev.subtype === "compact_boundary") {
    els.messages.append(h("div", "divider", "Đã tóm gọn hội thoại"));
  } else if (ev.subtype === "conversation_reset") {
    resetView();
  } else if (typeof ev.content === "string" && ev.content.trim()) {
    addOutput(ev.content);
  }
}

function finishTurn(ev) {
  view.liveText = null;
  if (ev.is_error || ev.subtype !== "success") {
    const msg = (ev.errors && ev.errors.join("\n")) || ev.result || ev.subtype;
    if (msg && !/interrupt/i.test(msg)) notice(msg, "error");
  } else if (ev.local_command && ev.result) {
    addOutput(ev.result);
  }
  const secs = ev.duration_ms ? `${(ev.duration_ms / 1000).toFixed(1)}s` : "";
  const cost = ev.total_cost_usd ? ` · $${ev.total_cost_usd.toFixed(3)}` : "";
  if (secs) els.messages.append(h("div", "turn-meta", secs + cost));
}

function notice(text, kind = "") {
  els.messages.append(h("div", "notice " + kind, text));
  scrollToBottom();
}

function markdown(text) {
  const html = DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: false }));
  return html.replace(/<a /g, '<a target="_blank" rel="noopener" ');
}

function highlight(el) {
  for (const code of el.querySelectorAll("pre code")) {
    try { hljs.highlightElement(code); } catch {}
    const pre = code.parentElement;
    const copy = button("Sao chép", "copy", () => {
      navigator.clipboard.writeText(code.textContent);
      copy.textContent = "Đã chép";
      setTimeout(() => (copy.textContent = "Sao chép"), 1200);
    });
    pre.append(copy);
  }
}

// ---------- composer ----------

function setBusy(busy) {
  state.busy = busy;
  els.working.hidden = !busy;
  if (busy) els.workingText.textContent = "Đang làm…";
  updateSendEnabled();
}

// SVG elements have no .hidden property, so the button swaps icons via a class.
function updateSendEnabled() {
  const stop = state.busy && !els.input.value.trim();
  els.send.disabled = !state.connected || (!els.input.value.trim() && !state.busy);
  els.send.classList.toggle("stop", stop);
  els.send.title = stop ? "Dừng (Esc)" : "Gửi (Enter)";
}

async function submit() {
  const text = els.input.value.trim();
  if (!text) {
    if (state.busy) interrupt();
    return;
  }
  if (runLocalCommand(text)) return;
  els.input.value = "";
  autosize();
  hideSlash();
  try {
    const key = await ensureSession();
    post({ type: "send", key, text });
    setBusy(true);
    scrollToBottom(true);
  } catch (err) {
    els.input.value = text;
    notice(err.message, "error");
  }
}

function runLocalCommand(text) {
  const [cmd] = text.split(/\s+/);
  const done = () => {
    els.input.value = "";
    autosize();
    hideSlash();
    return true;
  };
  switch (cmd) {
    case "/new": newChat(); return done();
    case "/resume": openDrawer(); return done();
    case "/model": done(); els.model.focus(); els.model.showPicker?.(); return true;
    case "/mode": done(); els.mode.focus(); els.mode.showPicker?.(); return true;
  }
  return false;
}

function interrupt() {
  if (state.key) post({ type: "interrupt", key: state.key });
}

function autosize() {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, 220) + "px";
  updateSendEnabled();
}

function updateSlash() {
  const v = els.input.value;
  const m = v.match(/^\/(\S*)$/);
  if (!m) return hideSlash();
  const q = m[1].toLowerCase();
  const seen = new Set();
  const all = [...LOCAL_COMMANDS, ...state.commands].filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
  state.slashItems = all.filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.toLowerCase().startsWith(q) === b.name.toLowerCase().startsWith(q) ? 0 : a.name.toLowerCase().startsWith(q) ? -1 : 1)
    .slice(0, 50);
  if (!state.slashItems.length) return hideSlash();
  state.slashIndex = 0;
  drawSlash();
}

function drawSlash() {
  els.slash.hidden = false;
  els.slash.textContent = "";
  state.slashItems.forEach((c, i) => {
    const item = h("div", "slash-item" + (i === state.slashIndex ? " active" : ""));
    item.append(h("span", "slash-name", "/" + c.name + (c.argumentHint ? " " + c.argumentHint : "")), h("span", "slash-desc", c.description || ""));
    item.onmousedown = (e) => {
      e.preventDefault();
      pickSlash(i);
    };
    els.slash.append(item);
  });
  els.slash.children[state.slashIndex]?.scrollIntoView({ block: "nearest" });
}

function pickSlash(i) {
  const c = state.slashItems[i];
  if (!c) return;
  els.input.value = "/" + c.name + " ";
  hideSlash();
  autosize();
  els.input.focus();
  if (LOCAL_COMMANDS.some((l) => l.name === c.name)) submit();
}

function hideSlash() {
  els.slash.hidden = true;
  state.slashItems = [];
}

function applyCapabilities(cap) {
  if (cap.commands?.length) state.commands = cap.commands.map((c) => (typeof c === "string" ? { name: c } : c));
  if (cap.models?.length) {
    state.models = cap.models;
    const current = els.model.value;
    els.model.textContent = "";
    els.model.append(new Option("Model mặc định", ""));
    for (const m of cap.models) {
      const value = m.value ?? m.id ?? m.name;
      els.model.append(new Option(m.displayName || m.display_name || value, value));
    }
    selectModel(current);
  }
}

function selectModel(model) {
  if (!model) return;
  const opts = [...els.model.options];
  const hit = opts.find((o) => o.value === model) || opts.find((o) => o.value && model.includes(o.value));
  if (hit) els.model.value = hit.value;
  else {
    els.model.append(new Option(model, model));
    els.model.value = model;
  }
}

// ---------- events ----------

els.input.addEventListener("input", () => {
  autosize();
  updateSlash();
});

els.input.addEventListener("keydown", (e) => {
  // Telex/VNI composition must finish before Enter means "send".
  if (e.isComposing || e.keyCode === 229) return;
  if (!els.slash.hidden) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = state.slashItems.length;
      state.slashIndex = (state.slashIndex + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
      return drawSlash();
    }
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      return pickSlash(state.slashIndex);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      return hideSlash();
    }
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  } else if (e.key === "Tab" && e.shiftKey) {
    e.preventDefault();
    els.mode.value = MODES[(MODES.indexOf(els.mode.value) + 1) % MODES.length];
    els.mode.dispatchEvent(new Event("change"));
  } else if (e.key === "Escape" && state.busy) {
    e.preventDefault();
    interrupt();
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && !e.shiftKey) {
    e.preventDefault();
    newChat();
  } else if (e.key === "Escape" && !els.drawer.hidden) {
    closeDrawer();
  }
});

els.send.onclick = () => (state.busy && !els.input.value.trim() ? interrupt() : submit());
els.newBtn.onclick = newChat;
els.sessionsBtn.onclick = () => (els.drawer.hidden ? openDrawer() : closeDrawer());
els.drawerSearch.oninput = renderDrawer;
els.mode.onchange = () => {
  if (state.key) post({ type: "set_mode", key: state.key, mode: els.mode.value });
};
els.model.onchange = () => {
  if (state.key) post({ type: "set_model", key: state.key, model: els.model.value || undefined });
};
els.cwd.onchange = () => rememberDir(els.cwd.value.trim());

// ---------- helpers ----------

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(label, cls, onClick) {
  const b = h("button", "btn " + cls, label);
  b.onclick = onClick;
  return b;
}

function prefixLines(s, p) {
  return String(s ?? "").split("\n").map((l) => p + l).join("\n");
}

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

function shortPath(p) {
  if (!p) return "";
  const home = state.home;
  const rel = home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
  const parts = rel.split("/");
  return parts.length > 3 ? "…/" + parts.slice(-2).join("/") : rel;
}

function ago(t) {
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

function scrollToBottom(force) {
  const el = els.scroller;
  const near = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  if (force || near) el.scrollTop = el.scrollHeight;
}

function showBanner(text, withRetry) {
  els.banner.hidden = false;
  els.banner.textContent = text;
  if (withRetry) els.banner.append(button("Kết nối lại", "", () => connect()));
}

function hideBanner() {
  els.banner.hidden = true;
}

async function getLocal(k) {
  try { return (await chrome.storage.local.get(k))[k]; } catch { return undefined; }
}

function setLocal(k, v) {
  try { chrome.storage.local.set({ [k]: v }); } catch {}
}

async function rememberDir(dir) {
  if (!dir) return;
  setLocal("lastCwd", dir);
  const dirs = ((await getLocal("recentDirs")) || []).filter((d) => d !== dir);
  dirs.unshift(dir);
  setLocal("recentDirs", dirs.slice(0, 12));
  fillRecentDirs(dirs);
}

function fillRecentDirs(dirs) {
  els.recentDirs.textContent = "";
  for (const d of dirs || []) els.recentDirs.append(new Option(d));
}

getLocal("recentDirs").then(fillRecentDirs);
connect();
els.input.focus();
