const API = "/api";

let allNotes = [];
let editingNoteId = null;

// -- Helpers --

function getUserId() {
  return localStorage.getItem("nk_user_id");
}

function setUserId(id) {
  localStorage.setItem("nk_user_id", id);
}

function clearUser() {
  localStorage.removeItem("nk_user_id");
  localStorage.removeItem("nk_user");
}

async function apiFetch(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const userId = getUserId();
  let url = `${API}${path}`;

  if (method === "GET") {
    if (userId) url += `${url.includes("?") ? "&" : "?"}userId=${userId}`;
  } else if (userId) {
    const existing = options.body ? JSON.parse(options.body) : {};
    options = { ...options, body: JSON.stringify({ ...existing, userId }) };
  }

  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Something went wrong");
  }
  return data;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// -- Auth UI --

function switchTab(tab) {
  document
    .getElementById("login-form")
    .classList.toggle("hidden", tab !== "login");
  document
    .getElementById("register-form")
    .classList.toggle("hidden", tab !== "register");
  document.querySelectorAll(".tab-btn").forEach((btn, i) => {
    btn.classList.toggle(
      "active",
      (i === 0 && tab === "login") || (i === 1 && tab === "register")
    );
  });
  hideAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideAuthError() {
  document.getElementById("auth-error").classList.add("hidden");
}

async function handleLogin(e) {
  e.preventDefault();
  hideAuthError();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setUserId(data.user.id);
    localStorage.setItem("nk_user", JSON.stringify(data.user));
    enterApp(data.user);
  } catch (err) {
    showAuthError(err.message);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideAuthError();
  const userName = document.getElementById("reg-username").value;
  const email = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;
  try {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, email, password }),
    });
    setUserId(data.user.id);
    localStorage.setItem("nk_user", JSON.stringify(data.user));
    enterApp(data.user);
  } catch (err) {
    showAuthError(err.message);
  }
}

function logout() {
  clearUser();
  allNotes = [];
  document.getElementById("app-screen").classList.add("hidden");
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("login-form").reset();
}

// -- App shell --

function enterApp(user) {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  document.getElementById("welcome-msg").textContent = `Hi, ${user.userName}`;
  loadNotes();
}

// -- Notes: data fetching --

async function loadNotes() {
  try {
    allNotes = await apiFetch("/notes");
    renderNotes();
  } catch (err) {
    if (err.message.includes("authorized")) {
      clearUser();
      logout();
    }
  }
}

// -- Notes: rendering --

function renderNotes() {
  const category = document.getElementById("filter-category").value;
  const search = document.getElementById("search-input").value.toLowerCase();

  const filtered = allNotes.filter((note) => {
    const matchCategory = category === "all" || note.category === category;
    const matchSearch =
      note.title.toLowerCase().includes(search) ||
      note.content.toLowerCase().includes(search);
    return matchCategory && matchSearch;
  });

  const grid = document.getElementById("notes-grid");
  const emptyMsg = document.getElementById("empty-msg");

  if (filtered.length === 0) {
    grid.innerHTML = "";
    emptyMsg.classList.remove("hidden");
    return;
  }
  emptyMsg.classList.add("hidden");

  grid.innerHTML = filtered
    .map(
      (note) => `
    <div class="note-card ${note.isPinned ? "pinned" : ""}">
      <div class="note-card-header">
        <span class="note-card-title">${escapeHtml(note.title)}</span>
        ${
          note.isPinned ? '<span class="pin-icon" title="Pinned">📌</span>' : ""
        }
      </div>
      <p class="note-card-content">${escapeHtml(note.content)}</p>
      <div class="note-card-footer">
        <span class="category-badge">${note.category}</span>
        <span class="note-date">${formatDate(note.updatedAt)}</span>
      </div>
      <div class="note-card-actions">
        <button class="btn-card" onclick="openEditModal('${
          note._id
        }')">Edit</button>
        <button class="btn-card btn-delete" onclick="deleteNote('${
          note._id
        }')">Delete</button>
      </div>
    </div>
  `
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// -- Note Modal: open / close --

function openModal() {
  editingNoteId = null;
  document.getElementById("modal-title").textContent = "New Note";
  document.getElementById("note-form").reset();
  hideNoteError();
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function openEditModal(id) {
  const note = allNotes.find((n) => n._id === id);
  if (!note) return;

  editingNoteId = id;
  document.getElementById("modal-title").textContent = "Edit Note";
  document.getElementById("note-title").value = note.title;
  document.getElementById("note-content").value = note.content;
  document.getElementById("note-category").value = note.category;
  document.getElementById("note-pinned").checked = note.isPinned;
  hideNoteError();
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
}

function showNoteError(msg) {
  const el = document.getElementById("note-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideNoteError() {
  document.getElementById("note-error").classList.add("hidden");
}

// -- Notes: CRUD --

async function handleNoteSubmit(e) {
  e.preventDefault();
  hideNoteError();

  const body = {
    title: document.getElementById("note-title").value.trim(),
    content: document.getElementById("note-content").value.trim(),
    category: document.getElementById("note-category").value,
    isPinned: document.getElementById("note-pinned").checked,
  };

  try {
    if (editingNoteId) {
      const updated = await apiFetch(`/notes/${editingNoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      allNotes = allNotes.map((n) => (n._id === editingNoteId ? updated : n));
    } else {
      const created = await apiFetch("/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      allNotes.unshift(created);
    }

    closeModal();
    renderNotes();
  } catch (err) {
    showNoteError(err.message);
  }
}

async function deleteNote(id) {
  if (!confirm("Delete this note?")) return;
  try {
    await apiFetch(`/notes/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    allNotes = allNotes.filter((n) => n._id !== id);
    renderNotes();
  } catch (err) {
    alert(err.message);
  }
}

// -- Profile Settings Modal --

function openProfileModal() {
  document.getElementById("profile-form").reset();
  hideProfileError();
  hideProfileSuccess();
  document.getElementById("profile-overlay").classList.remove("hidden");
}

function closeProfileModal() {
  document.getElementById("profile-overlay").classList.add("hidden");
}

function closeProfileOnOverlay(e) {
  if (e.target === document.getElementById("profile-overlay")) closeProfileModal();
}

function showProfileError(msg) {
  const el = document.getElementById("profile-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideProfileError() {
  document.getElementById("profile-error").classList.add("hidden");
}

function showProfileSuccess(msg) {
  const el = document.getElementById("profile-success");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideProfileSuccess() {
  document.getElementById("profile-success").classList.add("hidden");
}

async function handleProfileSubmit(e) {
  e.preventDefault();
  hideProfileError();
  hideProfileSuccess();

  const currentPassword = document.getElementById("profile-current-password").value;
  const newUserName = document.getElementById("profile-username").value.trim();
  const newPassword = document.getElementById("profile-new-password").value;

  if (!newUserName && !newPassword) {
    showProfileError("Enter a new username or new password to update.");
    return;
  }

  const body = { currentPassword };
  if (newUserName) body.newUserName = newUserName;
  if (newPassword) body.newPassword = newPassword;

  try {
    const data = await apiFetch("/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    localStorage.setItem("nk_user", JSON.stringify(data.user));
    document.getElementById("welcome-msg").textContent = `Hi, ${data.user.userName}`;
    showProfileSuccess("Profile updated successfully!");
    document.getElementById("profile-form").reset();
  } catch (err) {
    showProfileError(err.message);
  }
}

// -- Bootstrap --

(function init() {
  const userId = getUserId();
  const user = JSON.parse(localStorage.getItem("nk_user") || "null");
  if (userId && user) {
    enterApp(user);
  }
})();
