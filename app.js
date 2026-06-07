// ===========================================================================
// HTML Notes — static gallery backed by Supabase (Storage + Postgres + Auth).
// Public read; only OWNER_EMAIL (logged in) can upload/delete.
// ===========================================================================

const BUCKET = "notes";

const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ---- state ----------------------------------------------------------------
let allNotes = [];       // every note loaded from the DB
let activeTag = null;    // currently selected tag filter (null = All)
let searchTerm = "";     // lowercased search box value
let session = null;      // current Supabase auth session (or null)

// ---- DOM refs -------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const grid       = $("#grid");
const tagBar     = $("#tag-bar");
const statusEl   = $("#status");
const emptyEl    = $("#empty");
const authArea   = $("#auth-area");
const searchInput= $("#search");
const uploadBtn  = $("#upload-btn");

// ---- helpers --------------------------------------------------------------
const isOwner = () =>
  !!session && session.user?.email?.toLowerCase() === window.OWNER_EMAIL.toLowerCase();

const publicUrl = (path) =>
  db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";

function showStatus(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
}

// ===========================================================================
// Data loading
// ===========================================================================
async function loadNotes() {
  showStatus("Loading notes…");
  const { data, error } = await db
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showStatus("Could not load notes: " + error.message);
    return;
  }
  showStatus("");
  allNotes = data || [];
  renderTags();
  render();
}

// ===========================================================================
// Rendering
// ===========================================================================
function visibleNotes() {
  return allNotes.filter((n) => {
    if (activeTag && !(n.tags || []).includes(activeTag)) return false;
    if (searchTerm) {
      const hay = [n.title, n.description, ...(n.tags || [])].join(" ").toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  });
}

function render() {
  const notes = visibleNotes();
  grid.innerHTML = "";

  if (allNotes.length === 0) {
    emptyEl.hidden = false;
    emptyEl.querySelector("p").textContent =
      isOwner() ? "No notes yet — click “Upload note” to add one." : "No notes yet.";
    return;
  }
  emptyEl.hidden = true;

  if (notes.length === 0) {
    grid.innerHTML = `<div class="status">No notes match your search.</div>`;
    return;
  }

  for (const n of notes) {
    const url = publicUrl(n.storage_path);
    const tags = (n.tags || [])
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <h3><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></h3>
      ${n.description ? `<p class="desc">${escapeHtml(n.description)}</p>` : `<p class="desc"></p>`}
      ${tags ? `<div class="tags">${tags}</div>` : ""}
      <div class="card-actions">
        <a class="open-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open ↗</a>
        <span class="meta">${fmtDate(n.created_at)}</span>
        ${isOwner() ? `<button class="delete-btn" data-id="${n.id}">Delete</button>` : ""}
      </div>`;
    grid.appendChild(card);
  }

  // wire delete buttons (owner only)
  grid.querySelectorAll(".delete-btn").forEach((btn) =>
    btn.addEventListener("click", () => onDelete(btn.dataset.id)));
}

function renderTags() {
  const tags = [...new Set(allNotes.flatMap((n) => n.tags || []))].sort();
  tagBar.innerHTML = "";
  if (tags.length === 0) return;

  const mkChip = (label, value) => {
    const chip = document.createElement("button");
    chip.className = "tag-chip" + ((activeTag === value) ? " active" : "");
    chip.textContent = label;
    chip.addEventListener("click", () => {
      activeTag = value;
      renderTags();
      render();
    });
    return chip;
  };

  tagBar.appendChild(mkChip("All", null));
  tags.forEach((t) => tagBar.appendChild(mkChip(t, t)));
}

// ===========================================================================
// Auth
// ===========================================================================
function updateAuthUI() {
  authArea.innerHTML = "";

  if (isOwner()) {
    const email = document.createElement("span");
    email.className = "auth-email";
    email.textContent = session.user.email;
    const out = document.createElement("button");
    out.className = "btn";
    out.textContent = "Log out";
    out.addEventListener("click", async () => { await db.auth.signOut(); });
    authArea.append(email, out);
    uploadBtn.hidden = false;
  } else {
    uploadBtn.hidden = true;
    // Reading is fully public — regular visitors see NO login UI at all.
    // The admin login is only exposed when the URL ends in "#admin", so email
    // sign-in is reserved for adding/removing notes.
    if (window.location.hash === "#admin") {
      const login = document.createElement("button");
      login.className = "btn";
      login.textContent = "Owner login";
      login.addEventListener("click", () => openModal("#login-modal"));
      authArea.appendChild(login);
    }
  }
}

// ===========================================================================
// Upload / delete
// ===========================================================================
async function onUpload(e) {
  e.preventDefault();
  const errBox = $("#upload-error");
  const submit = $("#upload-submit");
  errBox.hidden = true;

  const file = $("#f-file").files[0];
  const title = $("#f-title").value.trim();
  const description = $("#f-desc").value.trim();
  const tags = $("#f-tags").value.split(",").map((t) => t.trim()).filter(Boolean);

  if (!file || !title) return;

  submit.disabled = true;
  submit.textContent = "Uploading…";

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${crypto.randomUUID()}-${safe}`;

  try {
    const up = await db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: "text/html", upsert: false });
    if (up.error) throw up.error;

    const ins = await db.from("notes").insert({ title, description, tags, storage_path: path });
    if (ins.error) {
      await db.storage.from(BUCKET).remove([path]); // rollback the orphaned file
      throw ins.error;
    }

    closeModal("#upload-modal");
    $("#upload-form").reset();
    await loadNotes();
  } catch (err) {
    errBox.textContent = err.message || "Upload failed.";
    errBox.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = "Upload";
  }
}

async function onDelete(id) {
  const note = allNotes.find((n) => n.id === id);
  if (!note) return;
  if (!confirm(`Delete “${note.title}”? This cannot be undone.`)) return;

  const del = await db.from("notes").delete().eq("id", id);
  if (del.error) { alert("Delete failed: " + del.error.message); return; }
  await db.storage.from(BUCKET).remove([note.storage_path]);
  await loadNotes();
}

async function onLogin(e) {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const msg = $("#login-msg");
  if (!email || !password) return;

  // Email + password sign-in. The owner account must exist in Supabase
  // (created via Dashboard → Authentication → Users → Add user with a
  // password). Works even with self-sign-ups disabled.
  const { error } = await db.auth.signInWithPassword({ email, password });
  msg.hidden = false;
  if (error) {
    msg.className = "form-error";
    msg.textContent = error.message;
  } else {
    msg.className = "form-msg";
    msg.textContent = "Logged in.";
    closeModal("#login-modal");
    $("#login-form").reset();
  }
}

// ===========================================================================
// Modals
// ===========================================================================
function openModal(sel) { $(sel).hidden = false; }
function closeModal(sel) { $(sel).hidden = true; }

// ===========================================================================
// Wiring
// ===========================================================================
function wireEvents() {
  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    render();
  });

  uploadBtn.addEventListener("click", () => openModal("#upload-modal"));
  $("#upload-cancel").addEventListener("click", () => closeModal("#upload-modal"));
  $("#upload-form").addEventListener("submit", onUpload);

  // default the title field to the picked file's name (sans extension)
  $("#f-file").addEventListener("change", (e) => {
    const titleInput = $("#f-title");
    const f = e.target.files[0];
    if (f && !titleInput.value.trim()) {
      titleInput.value = f.name.replace(/\.html?$/i, "").replace(/[-_]+/g, " ");
    }
  });

  $("#login-cancel").addEventListener("click", () => closeModal("#login-modal"));
  $("#login-form").addEventListener("submit", onLogin);

  // Reveal/hide the admin login when "#admin" is added/removed from the URL.
  window.addEventListener("hashchange", updateAuthUI);

  // click outside the card closes a modal
  document.querySelectorAll(".modal").forEach((m) =>
    m.addEventListener("click", (e) => { if (e.target === m) m.hidden = true; }));
}

// ===========================================================================
// Init
// ===========================================================================
async function init() {
  if (!window.SUPABASE_URL || window.SUPABASE_URL.includes("YOUR-PROJECT")) {
    showStatus("Supabase is not configured yet — edit config.js (see SETUP.md).");
    return;
  }

  wireEvents();

  const { data } = await db.auth.getSession();
  session = data.session;
  updateAuthUI();

  db.auth.onAuthStateChange((_event, s) => {
    session = s;
    updateAuthUI();
    render();
  });

  await loadNotes();
}

init();
