const API_BASE = "http://127.0.0.1:8000";

window.addEventListener("DOMContentLoaded", () => {
  // Guard
  if (!localStorage.getItem("token")) {
    window.location.href = "login.html";
    return;
  }

  setupTabs();
  setupBackBtn();
  loadSettings();

  wireProfileSave();
  wireAvatarUpload();
  wirePasswordReal();
  wireTwoFaReal();
});

// ---------------- Helpers ----------------
function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

function calculateAge(dobStr) {
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function applyAvatar(url) {
  const img = document.getElementById("avatarPreview");
  const fallback = document.getElementById("avatarFallback");

  if (url) {
    img.src = url;
    img.style.display = "block";
    fallback.style.display = "none";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    fallback.style.display = "flex";
  }
}

function setupBackBtn() {
  document.getElementById("backToDriveBtn")?.addEventListener("click", () => {
    window.location.href = "index.html";
  });
}

function setupTabs() {
  const navItems = document.querySelectorAll(".nav-item");
  const panels = {
    profile: document.getElementById("tab-profile"),
    security: document.getElementById("tab-security"),
    twofa: document.getElementById("tab-twofa"),
  };

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      navItems.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      Object.values(panels).forEach((p) => p.classList.remove("active"));
      const key = btn.dataset.tab;
      if (panels[key]) panels[key].classList.add("active");
    });
  });
}

// ---------------- Load ----------------
async function loadSettings() {
  const msg = document.getElementById("profileMsg");

  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: authHeaders(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "Failed to load profile");

    document.getElementById("setUsername").value = data.username || "";
    document.getElementById("setFirstName").value = data.first_name || "";
    document.getElementById("setLastName").value = data.last_name || "";
    document.getElementById("setEmail").value = data.email || "";
    document.getElementById("setPhone").value = data.phone || "";
    document.getElementById("setDob").value = data.dob || "";
    document.getElementById("setGender").value = data.gender || "";
    document.getElementById("setDriveMode").value = data.drive_mode || "private";

    // DOB hint
    const dobHint = document.getElementById("dobHint");
    if (data.dob) {
      const age = calculateAge(data.dob);
      dobHint.textContent = age !== null ? `Age: ${age}` : "";
    } else {
      dobHint.textContent = "";
    }

    // Avatar
    if (data.avatar_url) applyAvatar(`${API_BASE}${data.avatar_url}`);
    else applyAvatar("");

    // 2FA
    const toggle = document.getElementById("twoFaToggle");
    const method = document.getElementById("twoFaMethod");
    const status = document.getElementById("twoFaStatus");
    const box = document.getElementById("twoFaBox");

    if (toggle) toggle.checked = !!data.two_fa_enabled;
    if (method) method.value = data.two_fa_method || "sms";
    if (status) status.value = data.two_fa_enabled ? "Enabled" : "Disabled";
    if (box) box.style.display = data.two_fa_enabled ? "block" : "none";

  } catch (err) {
    console.error(err);
    if (msg) {
      msg.textContent = err.message || "Failed to load";
      msg.className = "msg error";
    }
  }
}

// ---------------- Profile Save (REAL) ----------------
function wireProfileSave() {
  const btn = document.getElementById("saveProfileBtn");
  const msg = document.getElementById("profileMsg");
  const dobEl = document.getElementById("setDob");

  dobEl?.addEventListener("change", () => {
    const age = calculateAge(dobEl.value);
    document.getElementById("dobHint").textContent = age !== null ? `Age: ${age}` : "";
  });

  btn?.addEventListener("click", async () => {
    msg.textContent = "";
    msg.className = "msg";

    const firstName = document.getElementById("setFirstName").value.trim();
    const lastName = document.getElementById("setLastName").value.trim();
    const email = document.getElementById("setEmail").value.trim();
    const phone = document.getElementById("setPhone").value.trim();
    const dob = document.getElementById("setDob").value.trim();
    const gender = document.getElementById("setGender").value;
    const driveMode = document.getElementById("setDriveMode").value; // private/share

    // same validations you already had
    if (!firstName || !lastName) {
      msg.textContent = "First name and last name are required.";
      msg.classList.add("error");
      return;
    }

    if (dob) {
      const age = calculateAge(dob);
      if (age === null) {
        msg.textContent = "Invalid DOB.";
        msg.classList.add("error");
        return;
      }
      if (age < 12) {
        msg.textContent = "Age restriction: You must be 12 or older.";
        msg.classList.add("error");
        return;
      }
    }

    if (email && !email.includes("@")) {
      msg.textContent = "Invalid email.";
      msg.classList.add("error");
      return;
    }

    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10) {
        msg.textContent = "Invalid phone (need at least 10 digits).";
        msg.classList.add("error");
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          dob,
          gender,
          drive_mode: driveMode,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Update failed");

      msg.textContent = "Saved ✅";
      msg.classList.add("success");
      setTimeout(() => {
        msg.textContent = "";
        msg.className = "msg";
      }, 2000);

      // optional: reload to refresh avatar_url / twofa etc.
      // await loadSettings();

    } catch (err) {
      console.error(err);
      msg.textContent = err.message || "Save failed";
      msg.classList.add("error");
    }
  });

  
}

// ---------------- Avatar Upload (REAL) ----------------
function wireAvatarUpload() {
  const input = document.getElementById("avatarInput");
  const removeBtn = document.getElementById("removeAvatarBtn");
  const msg = document.getElementById("profileMsg");

  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      msg.textContent = "Please select an image file.";
      msg.className = "msg error";
      return;
    }

    const maxBytes = 2 * 1024 * 1024; // 2MB
    if (file.size > maxBytes) {
      msg.textContent = "Image too large (max 2MB).";
      msg.className = "msg error";
      return;
    }

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`${API_BASE}/users/me/avatar`, {
        method: "POST",
        headers: authHeaders(), // DO NOT set Content-Type for FormData
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      applyAvatar(`${API_BASE}${data.avatar_url}`);
      msg.textContent = "Picture updated ✅";
      msg.className = "msg success";
      setTimeout(() => (msg.textContent = ""), 1500);

      input.value = "";
    } catch (err) {
      console.error(err);
      msg.textContent = err.message || "Upload failed";
      msg.className = "msg error";
    }
  });

  // Remove avatar: UI-only unless you add backend delete endpoint
  removeBtn?.addEventListener("click", () => {
    applyAvatar("");
    msg.textContent = "Picture removed (UI only) ✅";
    msg.className = "msg success";
    setTimeout(() => (msg.textContent = ""), 1500);
  });
}

// ---------------- Password Change (REAL) ----------------
function wirePasswordReal() {
  const btn = document.getElementById("changePasswordBtn");
  const msg = document.getElementById("passMsg");

  btn?.addEventListener("click", async () => {
    msg.textContent = "";
    msg.className = "msg";

    const cur = document.getElementById("curPass").value.trim();
    const np = document.getElementById("newPass").value.trim();
    const np2 = document.getElementById("newPass2").value.trim();

    if (!cur || !np || !np2) {
      msg.textContent = "Please fill all fields.";
      msg.classList.add("error");
      return;
    }
    if (np.length < 4) {
      msg.textContent = "New password must be at least 4 characters.";
      msg.classList.add("error");
      return;
    }
    if (np !== np2) {
      msg.textContent = "New passwords do not match.";
      msg.classList.add("error");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/users/me/password`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          current_password: cur,
          new_password: np,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Password change failed");

      msg.textContent = "Password changed ✅";
      msg.classList.add("success");

      document.getElementById("curPass").value = "";
      document.getElementById("newPass").value = "";
      document.getElementById("newPass2").value = "";

    } catch (err) {
      console.error(err);
      msg.textContent = err.message || "Password change failed";
      msg.classList.add("error");
    }
  });
}

// ---------------- 2FA Save (REAL) ----------------
// This assumes backend stores: two_fa_enabled, two_fa_method
function wireTwoFaReal() {
  const toggle = document.getElementById("twoFaToggle");
  const box = document.getElementById("twoFaBox");
  const method = document.getElementById("twoFaMethod");
  const status = document.getElementById("twoFaStatus");
  const saveBtn = document.getElementById("saveTwoFaBtn");
  const msg = document.getElementById("twoFaMsg");

  toggle?.addEventListener("change", () => {
    const enabled = toggle.checked;
    if (box) box.style.display = enabled ? "block" : "none";
    if (status) status.value = enabled ? "Enabled" : "Disabled";
  });

  saveBtn?.addEventListener("click", async () => {
    msg.textContent = "";
    msg.className = "msg";

    try {
      // We update via PUT /users/me with twofa fields too
      const res = await fetch(`${API_BASE}/users/me`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          two_fa_enabled: !!toggle.checked,
          two_fa_method: method.value || "sms",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "2FA save failed");

      msg.textContent = "2FA settings saved ✅";
      msg.classList.add("success");
      setTimeout(() => {
        msg.textContent = "";
        msg.className = "msg";
      }, 2000);

    } catch (err) {
      console.error(err);
      msg.textContent = err.message || "2FA save failed";
      msg.classList.add("error");
    }
  });
}
