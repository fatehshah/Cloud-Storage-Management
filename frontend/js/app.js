const API_BASE = "http://127.0.0.1:8000";

// Elements
const logoutBtn = document.getElementById("logoutBtn");
const filesGrid = document.getElementById("filesGrid");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const refreshBtn = document.getElementById("refreshBtn");
const toast = document.getElementById("toast");
const storageText = document.getElementById("storageText");
const searchInput = document.getElementById("searchInput");
const sortBySelect = document.getElementById("sortBy");
const orderSelect = document.getElementById("order");
const newFolderBtn = document.getElementById("newFolderBtn");
const backBtn = document.getElementById("backBtn");
const crumbs = document.getElementById("crumbs");
const pageTitle = document.getElementById("pageTitle");
const trashActions = document.getElementById("trashActions");
const emptyTrashBtn = document.getElementById("emptyTrashBtn");
const restoreAllBtn = document.getElementById("restoreAllBtn");
const accNameEl = document.getElementById("accName");
const devEmoji = document.getElementById("devEmoji");
const topAvatarImg = document.getElementById("topAvatarImg");

//  for shairing modal
const shareModal = document.getElementById("shareModal");
const sharePermission = document.getElementById("sharePermission");
const shareExpiry = document.getElementById("shareExpiry");
const shareCreateBtn = document.getElementById("shareCreateBtn");
const shareLinkBox = document.getElementById("shareLinkBox");
const shareCopyBtn = document.getElementById("shareCopyBtn");
const shareCloseBtn = document.getElementById("shareCloseBtn");

// paste functionality
let clipboard = null;
try {
  const raw = localStorage.getItem("clipboard");
  clipboard = raw ? JSON.parse(raw) : null;
} catch (e) {
  console.log("Invalid clipboard in localStorage, clearing it...");
  localStorage.removeItem("clipboard");
  clipboard = null;
}

// ===== MULTI SELECT =====
let multiSelectOn = false;
const selectedItems = []; // array of { name, path, isFolder, inTrash }

function setClipboard(obj) {
  clipboard = obj;

  if (obj === null) localStorage.removeItem("clipboard");
  else localStorage.setItem("clipboard", JSON.stringify(obj));

  const pasteBtn = document.getElementById("pasteBtn");
  const cancelBtn = document.getElementById("cancelCopyBtn");
  if (!pasteBtn) return;

  const hasClip = !!clipboard && ["cut", "copy"].includes(clipboard.mode);

  // hide all by default
  pasteBtn.classList.toggle("hidden", !hasClip);
  pasteBtn.disabled = !hasClip;

  if (cancelBtn) {
    // Cancel button ONLY for copy
    const showCancel = hasClip && clipboard.mode === "copy";
    cancelBtn.classList.toggle("hidden", !showCancel);
    cancelBtn.disabled = !showCancel;
  }

  // Label for paste
  if (hasClip) {
    pasteBtn.textContent = clipboard.mode === "copy" ? "Paste Copy" : "Paste";
  }
}

// cancel button for copy
document.getElementById("cancelCopyBtn")?.addEventListener("click", () => {
  setClipboard(null);
  showToast("Copy cancelled ✅");
});


let shareContext = null; // { itemType, itemPath }
function openShareModal(itemType, itemPath) {
  if (!shareModal) {
    alert("shareModal HTML missing in index.html");
    return;
  }
  shareContext = { itemType, itemPath };
  shareLinkBox.value = "";
  shareExpiry.value = "";
  sharePermission.value = "view";
  shareModal.classList.remove("hidden");
}

function closeShareModal() {
  if (!shareModal) return;
  shareModal.classList.add("hidden");
  shareContext = null;
}

document.getElementById("pasteBtn")?.addEventListener("click", async () => {
  if (!clipboard || !["cut","copy"].includes(clipboard.mode)) {
    showToast("Nothing to paste ❌", true);
    return;
  }

  const toPath = currentPath || "";

  // ✅ support multi OR single clipboard
  const items = Array.isArray(clipboard.items)
    ? clipboard.items
    : [{ name: clipboard.name, fromPath: clipboard.fromPath, isFolder: clipboard.isFolder }];

  try {
    const endpoint = clipboard.mode === "cut" ? "move" : "copy";

    let success = 0;
    let failed = 0;

    for (const it of items) {
      const name = it.name;
      const fromPath = it.fromPath || it.path || "";  // (multi items might store `path`)
      const isFolder = !!it.isFolder;

      // skip only this item if same folder
      if ((fromPath || "") === (toPath || "")) continue;

      const url =
        `${API_BASE}/files/${endpoint}?name=${encodeURIComponent(name)}` +
        `&from_path=${encodeURIComponent(fromPath || "")}` +
        `&to_path=${encodeURIComponent(toPath || "")}` +
        `&is_folder=${encodeURIComponent(isFolder ? "true" : "false")}`;

      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
      });

      let data = {};
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) {
        console.error("Paste failed for:", name, data);
        failed++;
      } else {
        success++;
      }
    }

    // ✅ clear clipboard ONLY for CUT
    if (clipboard.mode === "cut") {
      setClipboard(null);
    } else {
      showToast("Copy ready — paste again or Cancel Copy ✅");
    }

    if (success > 0 && failed === 0) showToast(`Pasted ${success} item(s) ✅`);
    else if (success > 0 && failed > 0) showToast(`Pasted ${success}, Failed ${failed} ⚠`, true);
    else showToast("Nothing pasted ❌", true);

    loadDrive();

  } catch (err) {
    console.error(err);
    showToast(err.message || "Paste failed ❌", true);
  }
});

// Viewer
const viewerModal = document.getElementById("viewerModal");
const viewerTitle = document.getElementById("viewerTitle");
const viewerBody = document.getElementById("viewerBody");
const closeViewerBtn = document.getElementById("closeViewerBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");

// Confirm Modal
const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmText = document.getElementById("confirmText");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmOkBtn = document.getElementById("confirmOkBtn");
// Details Modal
const detailsModal = document.getElementById("detailsModal");
const detailsTitle = document.getElementById("detailsTitle");
const detailsBody = document.getElementById("detailsBody");
const detailsCloseBtn = document.getElementById("detailsCloseBtn");
// ✅ Ensure modals hidden on start (THIS FIXES YOUR ISSUE)
viewerModal.classList.remove("open");
confirmModal.classList.add("hidden");

let currentZoom = 1;
let currentPath = "";
let currentView = "all"; // all/images/videos/audio/docs/trash
let confirmAction = null;
// ✅ Local favourite store (for UI)
let favStore = JSON.parse(localStorage.getItem("favStore")) || [];

// ye multi users ke lia add hwa ha 

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("jwt") ||
    ""
  );
}



// ---------- Storage (10GB bar) ----------
const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = Number(bytes || 0);
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function updateStorageUI(usedBytes) {
  const used = Number(usedBytes || 0);
  const pct = Math.min((used / STORAGE_LIMIT_BYTES) * 100, 100);

  const bar = document.getElementById("progressBar");
  const text = document.getElementById("storageText");

  if (bar) bar.style.width = pct.toFixed(2) + "%";
  if (text) text.textContent = `${formatBytes(used)} / 10 GB`;

  if (!bar) return;
  bar.classList.remove("warn", "danger");
  if (pct >= 100) bar.classList.add("danger");
  else if (pct >= 85) bar.classList.add("warn");
}

function sumUsedBytes(files) {
  let used = 0;
  for (const f of (files || [])) {
    used += Number(f.size || 0); // your API already uses f.size in MB display
  }
  return used;
}

// ✅ Always get TOTAL drive usage from backend (not current folder)
async function refreshStorageBar() {
  try {
    const res = await fetch(`${API_BASE}/files/storage`, {
      headers: authHeaders(),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Storage fetch failed");

    updateStorageUI(data.used_bytes || 0);
  } catch (err) {
    console.error("Storage error:", err);
    // optional: showToast("Storage load failed ❌", true);
  }
}


function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  }[m]));
}

function formatDateTime(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function openDetails(name, path, isFolder) {
  try {
    detailsTitle.textContent = `Details: ${name}`;
    detailsBody.innerHTML = "Loading...";
    detailsModal.classList.remove("hidden");

    const url =
      `${API_BASE}/files/details?name=${encodeURIComponent(name)}` +
      `&path=${encodeURIComponent(path || "")}` +
      `&is_folder=${encodeURIComponent(isFolder ? "true" : "false")}`;

    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Details failed");

    const rows = [];
    rows.push(`<b>Name:</b> ${escapeHtml(data.name)}`);
    rows.push(`<b>Type:</b> ${escapeHtml(data.type || (data.is_folder ? "folder" : "file"))}`);
    rows.push(`<b>Path:</b> /${escapeHtml(data.path || "")}`);
    rows.push(`<b>Created:</b> ${escapeHtml(formatDateTime(data.created_at))}`);
    rows.push(`<b>Modified:</b> ${escapeHtml(formatDateTime(data.modified_at))}`);

    if (data.is_folder) {
      rows.push(`<b>Items:</b> ${data.items_count ?? "-"}`);
      rows.push(`<b>Total Size:</b> ${formatBytes(data.total_size || 0)}`);
    } else {
      rows.push(`<b>Size:</b> ${formatBytes(data.size || 0)}`);
    }

    detailsBody.innerHTML = rows.map(r => `<div>${r}</div>`).join("");

  } catch (err) {
    detailsBody.innerHTML = `<div style="color:#b00000;">${escapeHtml(err.message || "Details failed")}</div>`;
  }
}

function closeDetails() {
  detailsModal.classList.add("hidden");
  detailsBody.innerHTML = "";
}


const folderMatchCache = new Map();

async function folderHasMatchingFiles(fullPath, view) {
  const key = `${view}:${fullPath}`;
  if (folderMatchCache.has(key)) return folderMatchCache.get(key);

  try {
    const res = await fetch(
      `${API_BASE}/files/?path=${encodeURIComponent(fullPath)}&q=&sort_by=name&order=asc`,
      { headers: authHeaders() }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      folderMatchCache.set(key, false);
      return false;
    }

    const files = data.files || [];
    const folders = data.folders || [];

    // ✅ if this folder has matching file, return true
    if (files.some(f => isAllowedByViewType(view, f.name))) {
      folderMatchCache.set(key, true);
      return true;
    }

    // ✅ else check subfolders
   for (const sub of folders) {
  const subName = sub.name || sub;

  // ✅ subfolder full path should be inside current folder
  const subFull = `${fullPath}/${subName}`.replace(/^\/+/, "");

  const ok = await folderHasMatchingFiles(subFull, view);
  if (ok) {
    folderMatchCache.set(key, true);
    return true;
  }
}


    folderMatchCache.set(key, false);
    return false;
  } catch (e) {
    folderMatchCache.set(key, false);
    return false;
  }
}



// ---------- Toast ----------
let toastTimer;
let toastEndAt = 0;

function showToast(msg, isError = false, duration = 4500) {
  const now = Date.now();

  // If another toast comes quickly, never shorten the remaining time
  const desiredEnd = now + duration;
  toastEndAt = Math.max(toastEndAt, desiredEnd);

  const msgEl = toast.querySelector(".toast-msg");
  if (msgEl) msgEl.textContent = msg;
  else toast.textContent = msg;

  toast.style.background = isError ? "rgba(140,0,0,.92)" : "rgba(15,18,25,.92)";
  toast.style.setProperty("--toast-ms", (toastEndAt - now) + "ms");

  clearTimeout(toastTimer);

  // show (don’t force restart every time)
  toast.classList.remove("hidden");
  toast.classList.add("show");

  // schedule hide based on the longest end time
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 350);
    toastEndAt = 0;
  }, toastEndAt - now);
}
// toast for fav 
let lastFavToastAt = 0;

function showFavToast(msg) {
  const now = Date.now();
  if (now - lastFavToastAt < 300) return; // prevent double toast
  lastFavToastAt = now;
  showToast(msg, false, 4500); // force normal duration
}


// ✅ Change confirm button label + color (only UI)
function setConfirmButton(label, type = "primary") {
  confirmOkBtn.textContent = label;

  // remove old styles
  confirmOkBtn.classList.remove("primary", "danger", "success");

  // apply new style
  confirmOkBtn.classList.add(type);
}

// ---------- Confirm ----------
function openConfirm(title, text, actionFn, okLabel = "OK", okType = "danger") {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  confirmAction = actionFn;

  // ✅ Always hide input for confirm modal (restore/delete)
  const input = document.getElementById("confirmInput");
  if (input) input.classList.add("hidden");

  
  // ✅ Update button label + color
  confirmOkBtn.textContent = okLabel;
  confirmOkBtn.classList.remove("danger", "primary", "success");
  confirmOkBtn.classList.add(okType);

  confirmModal.classList.remove("hidden");
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token
    ? { ...extra, Authorization: `Bearer ${token}` }
    : extra;
}

// ✅ PASTE RENAME FUNCTION HERE (GLOBAL)
async function renameItem(oldName, newName, path, isFolder) {
  const url =
    `${API_BASE}/files/rename?old_name=${encodeURIComponent(oldName)}` +
    `&new_name=${encodeURIComponent(newName)}` +
    `&path=${encodeURIComponent(path || "")}` +
    `&is_folder=${encodeURIComponent(isFolder ? "true" : "false")}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: authHeaders(),
  });

  let data = {};
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) throw new Error(data.detail || "Rename failed");
  return data;
}



async function fetchAsBlobUrl(url) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error("Preview failed (Unauthorized?)");

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

const thumbCache = new Map(); // "path/name" -> blobUrl

async function setImageThumb(imgEl, fileUrl, cacheKey) {
  try {
    if (thumbCache.has(cacheKey)) {
      imgEl.src = thumbCache.get(cacheKey);
      return;
    }
    const blobUrl = await fetchAsBlobUrl(fileUrl);
    thumbCache.set(cacheKey, blobUrl);
    imgEl.src = blobUrl;
  } catch (e) {
    console.error("Thumb error:", e);
  }
}


// close cnfrm 
function closeConfirm() {
  confirmModal.classList.add("hidden");
  confirmAction = null;

  // ✅ always hide input + reset button
  const input = document.getElementById("confirmInput");
 if (input) {
    input.classList.add("hidden");
    input.value = "";
  }

  confirmOkBtn.textContent = "Delete";
  confirmOkBtn.classList.remove("primary");
  confirmOkBtn.classList.add("danger");
}


confirmCancelBtn.addEventListener("click", closeConfirm);
confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirm();
});

confirmOkBtn.addEventListener("click", async () => {
  if (confirmAction) await confirmAction();
  closeConfirm();
});

function openPrompt(title, text, placeholder, defaultValue, onSubmit) {
  confirmTitle.textContent = title;
  confirmText.textContent = text;

  const input = document.getElementById("confirmInput");
  input.classList.remove("hidden");
  input.placeholder = placeholder || "Enter...";
  input.value = defaultValue || "";
  // ✅ Set button to Create + green
  confirmOkBtn.textContent = "ok";
  confirmOkBtn.classList.remove("danger");
  confirmOkBtn.classList.add("success");
  setTimeout(() => input.focus(), 50);
  // ✅ Press Enter to submit
  input.onkeydown = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmOkBtn.click(); // triggers confirmAction
    }
  };

  confirmAction = async () => {
    const value = input.value.trim();
    if (!value) {
      showToast("Input required ❌", true);
      return;
    }
    await onSubmit(value);
    input.classList.add("hidden");
  };

  confirmModal.classList.remove("hidden");
}

function heartIcon(isActive) {
  if (isActive) {
    // filled heart
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 21s-7.2-4.4-9.6-8.3C.6 9.7 2 6.6 5.2 5.6c1.9-.6 3.9.1 5.1 1.6 1.2-1.5 3.2-2.2 5.1-1.6 3.2 1 4.6 4.1 2.8 7.1C19.2 16.6 12 21 12 21z"/>
    </svg>`;
  }

  // outline heart
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M20.8 8.6c0 5-8.8 10.9-8.8 10.9S3.2 13.6 3.2 8.6c0-2.5 2-4.6 4.6-4.6 1.7 0 3.2.9 4.2 2.2 1-1.3 2.5-2.2 4.2-2.2 2.6 0 4.6 2.1 4.6 4.6z"/>
  </svg>`;
}

// ---------- Helpers ----------
function fileType(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext)) return "image";
  if (["mp4","webm","mkv","mov","avi"].includes(ext)) return "video";
  if (["mp3","wav","ogg","m4a","aac","flac"].includes(ext)) return "audio";
  if (["pdf","txt","md","json","csv","xml","log"].includes(ext)) return "doc";
  if (["doc","docx","ppt","pptx","xls","xlsx"].includes(ext)) return "office";
  return "file";
}

function isFav(name, path = "", isFolder = false) {
  return favStore.some(
    (x) =>
      x.name === name &&
      (x.path || "") === (path || "") &&
      Boolean(x.is_folder) === Boolean(isFolder)
  );
}


function isAllowedByView(name) {
  const t = fileType(name);
  if (currentView === "all") return true;
  if (currentView === "images") return t === "image";
  if (currentView === "videos") return t === "video";
  if (currentView === "audio") return t === "audio";
  if (currentView === "docs") return t === "doc";
  return true;
}

function isAllowedByViewType(view, name) {
  const t = fileType(name);
  if (view === "images") return t === "image";
  if (view === "videos") return t === "video";
  if (view === "audio") return t === "audio";
  if (view === "docs") return t === "doc";
  return true; // for "all"
}


function updateCrumbs() {
  crumbs.textContent = "/" + (currentPath ? currentPath : "");
}

function downloadUrl(filename, filePath = null) {
  if (currentView === "trash")
    return `${API_BASE}/files/trash/download/${encodeURIComponent(filename)}`;

  const p = filePath !== null ? filePath : currentPath;
  return `${API_BASE}/files/download/${encodeURIComponent(filename)}?path=${encodeURIComponent(p)}`;
}

// chatgpt wala function ha 
async function downloadWithAuth(url, filename) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    showToast("Download failed ❌", true);
    return;
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}


// ---------- Load ----------
async function loadDrive() {
  try {
    updateCrumbs();

if (currentView === "favourites") {
  pageTitle.textContent = "Favourites ❤️";
  trashActions.classList.add("hidden");

const res = await fetch(`${API_BASE}/files/favourites`, {
  headers: authHeaders(),
});
  const data = await res.json();

  let folders = data.folders || [];
  let files = data.files || [];

  // ✅ filter files for current view
files = files.filter((f) => isAllowedByViewType(currentView, f.name));

// ✅ filter folders for current view (only show folders that contain matching files)
if (["images", "videos", "audio", "docs"].includes(currentView)) {
  const filtered = [];

  for (const folderItem of folders) {
    const folderName = folderItem.name || folderItem;
    const folderPath = folderItem.path || currentPath;

    const fullPath = (folderPath ? `${folderPath}/${folderName}` : folderName).replace(/^\/+/, "");

    const hasMatch = await folderHasMatchingFiles(fullPath, currentView);
    if (hasMatch) filtered.push(folderItem);
  }

  folders = filtered;
}


  // ✅ search filter
  const q = searchInput.value.trim().toLowerCase();
  if (q) {
    folders = folders.filter((x) => x.name.toLowerCase().includes(q));
    files = files.filter((x) => x.name.toLowerCase().includes(q));
  }

  
  renderUploads(folders, files, true); // ✅ third param = from favourites
  return;
}


    if (currentView === "trash") {
      pageTitle.textContent = "Trash";
      trashActions.classList.remove("hidden");
     const res = await fetch(`${API_BASE}/files/trash`, {
  headers: authHeaders(),
});


      if (!res.ok) {
        const msg = await res.text();
        throw new Error("Trash load failed: " + msg);
      }

      let data = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("Trash response is not JSON");
      }


      let files = data.files || [];
      let folders = data.folders || [];

      const q = searchInput.value.trim().toLowerCase();
      if (q) {
        files = files.filter((x) => x.name.toLowerCase().includes(q));
        folders = folders.filter((x) => x.toLowerCase().includes(q));
      }

      
      renderTrash(folders, files);
      return;
    }

    trashActions.classList.add("hidden");
pageTitle.textContent = "My Drive";

const q = searchInput.value.trim();
const sortBy = sortBySelect?.value || "name";
const order = orderSelect?.value || "asc";

console.log("FETCH:", q, sortBy, order); // ✅ debug (optional)

const res = await fetch(
  `${API_BASE}/files/?path=${encodeURIComponent(currentPath)}&q=${encodeURIComponent(q)}&sort_by=${sortBy}&order=${order}`,
  { headers: authHeaders() }
);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t);
    }
    const data = await res.json();

    let folders = data.folders || [];
    let files = data.files || [];
    // update storage (use ALL files sizes)
    await refreshStorageBar();
    const usedBytes = sumUsedBytes(files);
    updateStorageUI(usedBytes);
    // view filter
    // view filter for files
files = files.filter((f) => isAllowedByView(f.name));

// ✅ view filter for folders (only show folders that contain matching files)
if (["images", "videos", "audio", "docs"].includes(currentView)) {
  const filteredFolders = [];

  for (const folderItem of folders) {
    const folderName = folderItem.name || folderItem;

    // ✅ folder full path from currentPath
    const fullPath = (currentPath ? `${currentPath}/${folderName}` : folderName).replace(/^\/+/, "");

    const hasMatch = await folderHasMatchingFiles(fullPath, currentView);
    if (hasMatch) filteredFolders.push(folderItem);
  }

  folders = filteredFolders;
}

renderUploads(folders, files);

  } catch (err) {
  console.error(err);

  // ✅ only show "Backend not reachable" when network fails
  if (String(err.message).includes("Failed to fetch")) {
    showToast("Backend not reachable ❌", true);
  } else {
    showToast(err.message || "Something went wrong ❌", true);
  };
  }
}
// delete file function - Hussnain
async function deleteFile(filename, filePath) {
  openConfirm(
    "Move to Trash",
    `Move "${filename}" to Trash?`,
    async () => {
      try {
       const res = await fetch(
  `${API_BASE}/files/file/${encodeURIComponent(filename)}?path=${encodeURIComponent(filePath || "")}`,
  {
    method: "DELETE",
    headers: authHeaders(),
  }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Delete failed");

        showToast("Moved to Trash ✅");
        loadDrive();
      } catch (err) {
        console.error("Delete failed:", err);
        showToast(err.message || "Delete failed", true);
      }
    }
  );
}

// ye wala code search k liye hai jab koi folder search kren to usko view bhi krske
async function resolveFolderPathBySearch(folderName) {
  const res = await fetch(
    `${API_BASE}/files/?path=&q=${encodeURIComponent(folderName)}&sort_by=name&order=asc`,
    { headers: authHeaders() }
  );

  const data = await res.json();
  const folders = data.folders || [];

  // now folders = [{name, path}]
  const exact = folders.find(f => (f.name || "").toLowerCase() === folderName.toLowerCase());
  if (exact) return exact.path ? `${exact.path}/${exact.name}` : exact.name;

  const partial = folders.find(f => (f.name || "").toLowerCase().includes(folderName.toLowerCase()));
  if (partial) return partial.path ? `${partial.path}/${partial.name}` : partial.name;

  return null;
}



// ---------- Render Uploads ----------
function renderUploads(folders, files) {
  filesGrid.innerHTML = "";

  // folders first
  folders.forEach((folderItem) => {
  const folderName = folderItem.name || folderItem;
  const folderPath = folderItem.path || currentPath; 
    const card = document.createElement("div");
    card.className = "file-card";
    card.innerHTML = `
  <div class="card-menu">
    <button class="menu-btn">⋮</button>
    <div class="dropdown hidden">
      <button data-menu-action="rename"
  data-name="${folderName}"
  data-path="${folderPath}"
  data-type="folder">✏ Rename</button>

    <button data-menu-action="copy"
  data-name="${folderName}"
  data-path="${folderPath}"
  data-type="folder">📋 Copy</button>
      <button data-menu-action="cut"
  data-name="${folderName}"
  data-path="${folderPath}"
  data-type="folder">✂ Cut</button>
<button data-menu-action="details"
  data-name="${folderName}"
  data-path="${folderPath}"
  data-type="folder">ℹ Details</button>

      <button data-menu-action="share" data-name="${folderName}" data-path="${folderPath ? `${folderPath}/${folderName}`.replace(/^\/+/,"") : folderName}" data-type="folder">🔗 Share</button>
      <button data-menu-action="delete" data-name="${folderName}" class="danger">🗑 Delete</button>
    </div>
  </div>

  <div class="thumb">📁</div>
  <div class="file-name">${folderName}</div>
  <!-- ✅ HEART BUTTON for folders-->
    ${(() => {
  const fav = isFav(folderName, folderPath, true);
  return `
    <button class="fav-btn ${fav ? "active" : ""}"
      data-fav-name="${folderName}"
      data-fav-path="${folderPath}"
      data-fav-folder="true">
      ${heartIcon(fav)}
    </button>
  `;
})()}

  </div>
  <div class="file-meta">Folder</div>

  <div class="actions">
  <button class="btn small"
    data-open="${folderName}"
    data-path="${folderPath ? `${folderPath}/${folderName}`.replace(/^\/+/,"") : folderName}">
    Open
  </button>
</div>

  <!-- ✅ Keep old delete button hidden so old code works -->
  <div class="actions hidden">
    <button data-delfolder="${folderName}">Delete</button>
  </div>
  <!-- ✅ NEW: multi select checkbox -->
  <button class="select-box" title="Select"></button>
`;

    filesGrid.appendChild(card);
  });

  // files
  files.forEach((f) => {
    const name = f.name;
    const t = fileType(name);

    const card = document.createElement("div");
    card.className = "file-card";

    let thumb = `📄`;

if (t === "image") {
  thumb = `<img data-thumb="1" alt="thumb">`;
}
else if (t === "video") {
  // thumbnail will be generated from first frame
  thumb = `<img class="gen-video-thumb" data-video-thumb="${downloadUrl(name, f.path || null)}" alt="video thumb">`;
}
else if (name.toLowerCase().endsWith(".pdf")) {
  // thumbnail will be generated by pdf.js (page 1)
  thumb = `<img class="gen-pdf-thumb" data-pdf-thumb="${downloadUrl(name, f.path || null)}" alt="pdf thumb">`;
}
else if (t === "audio") {
  // duration will be filled later
  thumb = `<div class="audio-thumb">
    🎵 <span class="audio-time" data-audio-time="${downloadUrl(name, f.path || null)}">--:--</span>
  </div>`;
}

    // Cards - all files
    card.innerHTML = `
      <div class="thumb">${thumb}</div>
      <div class="file-name">
  ${name}

  <!-- ✅ HEART BUTTON  for files-->
  ${(() => {
  const fav = isFav(name, f.path || currentPath, false);
  return `
    <button class="fav-btn ${fav ? "active" : ""}"
      data-fav-name="${name}"
      data-fav-path="${f.path || currentPath}"
      data-fav-folder="false">
      ${heartIcon(fav)}
    </button>
  `;
})()}

</div>

      <div class="file-meta">${(f.size / 1024 / 1024).toFixed(2)} MB</div>
      <div class="card-menu">
  <button class="menu-btn">⋮</button>
  <div class="dropdown hidden">
    <button data-menu-action="download" data-name="${name}" data-path="${f.path || currentPath}">⬇ Download</button>
      <button data-menu-action="rename" data-name="${name}" data-path="${f.path || currentPath}" data-type="file">✏ Rename</button>
    <button data-menu-action="copy"
  data-name="${name}"
  data-path="${f.path || currentPath}"
  data-type="file">📋 Copy</button>
    <button data-menu-action="cut"
  data-name="${name}"
  data-path="${f.path || currentPath}"
  data-type="file">✂ Cut</button>
   <button data-menu-action="details"
  data-name="${name}"
  data-path="${f.path || currentPath}"
  data-type="file">ℹ Details</button>


    <button data-menu-action="share" data-name="${name}" data-path="${f.path || currentPath}" data-type="file">🔗 Share</button>
    <button data-menu-action="delete" data-name="${name}" data-path="${f.path || currentPath}" class="danger">🗑 Delete</button>
  </div>
</div>

<div class="actions">
 <button class="btn small view-btn"
  data-view="${name}"
  data-path="${f.path || currentPath}">
  View
</button>

</div>

<!-- Hidden old buttons (Download/Delete) so logic remains -->
<div class="actions hidden">
<button class="btn small" data-download="${name}" data-path="${f.path || currentPath}">Download</button>
<button data-delfile="${name}" data-path="${f.path || currentPath}">Delete</button>
</div>
  <!-- ✅ NEW: multi select checkbox -->
  <button class="select-box" title="Select"></button>
    `;
    filesGrid.appendChild(card);
    if (t === "image") {
  const img = card.querySelector("img[data-thumb]");
  const fileUrl = downloadUrl(name, f.path || null);
  const cacheKey = `${f.path || ""}/${name}`;
  setImageThumb(img, fileUrl, cacheKey);
}

  });

  
  // bindings
 document.querySelectorAll("[data-open]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const folderName = btn.dataset.open;

    // ✅ If user is searching, folder may exist in another nested location
    const isSearching = searchInput.value.trim() !== "";

    if (isSearching) {
      // ✅ try to locate correct folder path using backend search
      const foundPath = await resolveFolderPathBySearch(folderName);

      if (foundPath) {
        currentPath = foundPath;
        searchInput.value = ""; // ✅ clear search
        loadDrive();
        return;
      }
    }

    // ✅ Normal behavior (manual browsing)
    currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    searchInput.value = ""; // clear search
    loadDrive();
  });
});

generateVideoThumbs();
generatePdfThumbs();
generateAudioDurations();

  // Folder delete section
  document.querySelectorAll("[data-delfolder]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const filename = btn.dataset.delfolder;
      console.log("Delete clicked for:", filename);

      const ok = confirm(`Move "${filename}" to Trash?`);
      if (!ok) return;

      console.log("User confirmed delete, starting fetch...");

      try {
        const res = await fetch(
          `${API_BASE}/files/file/${encodeURIComponent(filename)}?path=${encodeURIComponent(currentPath)}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Delete failed");

        console.log("Delete request succeeded");
        showToast("Moved to Trash ✅");
        loadDrive();
      } catch (err) {
        console.error("Delete failed:", err);
        showToast(err.message || "Delete failed");  
      }
    });
  });

  // Delete wala code - Hussnain
  document.querySelectorAll("[data-delfile]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const filename = btn.dataset.delfile;
    const filePath = btn.dataset.path || currentPath;
      deleteFile(filename, filePath);
      //console.log("Delete clicked for:", filename);

      const ok = confirm(`Move "${filename}" to Trash?`);
      if (!ok) return;

      console.log("User confirmed delete, starting fetch...");

      try {
        const res = await fetch(
          `${API_BASE}/files/file/${encodeURIComponent(filename)}?path=${encodeURIComponent(filePath)}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Delete failed");

        console.log("Delete request succeeded");
        showToast("Moved to Trash ✅");
        loadDrive();
      } catch (err) {
        console.error("Delete failed:", err);
        showToast(err.message || "Delete failed");
      }
    });
  });


// view render 
  document.querySelectorAll(".view-btn").forEach((btn) => {
  btn.addEventListener("click", () =>
    openViewer(btn.dataset.view, btn.dataset.path || currentPath)
  );
});
attachSelectHandlers(false);

}

// ---------- Render Trash ----------
function renderTrash(folders, files) {
  filesGrid.innerHTML = "";

  if (!folders.length && !files.length) {
    filesGrid.innerHTML = `<div class="file-card"><div class="file-name">Trash is empty ✅</div></div>`;
    return;
  }

  folders.forEach((name) => {
    const card = document.createElement("div");
    card.className = "file-card";
    card.innerHTML = `
  <div class="card-menu">
    <button class="menu-btn">⋮</button>
    <div class="dropdown hidden">
      <button data-menu-action="details" data-name="${name}">ℹ Details</button>
      <button data-menu-action="delete" data-name="${name}" class="danger">🗑 Delete</button>
    </div>
  </div>

  <div class="thumb">📁</div>
  <div class="file-name">${name}</div>
  <div class="file-meta">Folder</div>

  <!-- ✅ Restore stays visible -->
  <div class="actions">
    <button class="btn small" data-restore="${name}">Restore</button>
  </div>

  <!-- ✅ Hidden delete button -->
  <div class="actions hidden">
    <button data-trashdel="${name}">Delete</button>
  </div>
   <!-- ✅ NEW: multi select checkbox -->
  <button class="select-box" title="Select"></button>
`;

    filesGrid.appendChild(card);
  });

  files.forEach((f) => {
    const name = f.name;
    const t = fileType(name);

    let thumb = "📄";
    if (t === "image") thumb = `<img data-thumb="1" alt="thumb" />`;
    if (t === "video") thumb = `🎥`;
    if (t === "audio") thumb = `🎵`;

    const card = document.createElement("div");
    card.className = "file-card";
   card.innerHTML = `
  <div class="card-menu">
    <button class="menu-btn">⋮</button>
    <div class="dropdown hidden">
      <button data-menu-action="details" data-name="${name}">ℹ Details</button>
      <button data-menu-action="delete" data-name="${name}" class="danger">🗑 Delete</button>
    </div>
  </div>

  <div class="thumb">${thumb}</div>
  <div class="file-name">${name}</div>
  <div class="file-meta">${(f.size / 1024 / 1024).toFixed(2)} MB</div>

  <!-- ✅ View + Restore stays visible -->
  <div class="actions">
   <button class="btn small view-btn" data-view="${name}" data-path="${f.path || currentPath}">View</button>

    <button class="btn small" data-restore="${name}">Restore</button>
  </div>

  <!-- ✅ Hidden delete button -->
  <div class="actions hidden">
    <button data-trashdel="${name}">Delete</button>
  </div>
  <!-- ✅ NEW: multi select checkbox -->
  <button class="select-box" title="Select"></button>
`;

    filesGrid.appendChild(card);
    if (t === "image") {
  const img = card.querySelector("img[data-thumb]");
  const fileUrl = downloadUrl(name, f.path || null);
  const cacheKey = `${f.path || ""}/${name}`;
  setImageThumb(img, fileUrl, cacheKey);
}

  });

  // Restore section
  document.querySelectorAll("[data-restore]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const name = btn.dataset.restore;

    openConfirm(
      "Restore Item",
      `Restore "${name}" back to Drive?`,
      async () => {
        try {
          const res = await fetch(
  `${API_BASE}/files/trash/restore/${encodeURIComponent(name)}`,
  {
    method: "POST",
    headers: authHeaders(),
  }
);


          let data = {};
          try { data = await res.json(); } catch (_) {}

          if (!res.ok) throw new Error(data.detail || "Restore failed");

          showToast("Restored ✅");
          currentView = "trash";
          loadDrive();
        } catch (err) {
          console.error("Restore failed:", err);
          showToast(err.message || "Restore failed", true);
        }
      },
      "Restore",     // ✅ button label
  "primary"      // ✅ button color
    );
  });
});


document.querySelectorAll("[data-trashdel]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const name = btn.dataset.trashdel;

    openConfirm(
      "Delete Permanently",
      `Delete "${name}" permanently?`,
      async () => {
        try {
          const res = await fetch(
  `${API_BASE}/files/trash/delete/${encodeURIComponent(name)}`,
  {
    method: "DELETE",
    headers: authHeaders(),
  }
);

          let data = {};
          try { data = await res.json(); } catch (_) {}

          if (!res.ok) throw new Error(data.detail || "Delete failed");

          showToast("Deleted permanently ✅");
          currentView = "trash";
          loadDrive();
        } catch (err) {
          console.error("Permanent delete failed:", err);
          showToast(err.message || "Delete failed", true);
        }
      }
    );
  });
});


  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => openViewer(btn.dataset.view));
  });
  attachSelectHandlers(true);
}


// ---------- Upload ----------
// ---------- Upload (Progress per file) ----------
function showUploadPanel() {
  const panel = document.getElementById("uploadPanel");
  if (panel) panel.classList.remove("hidden");
}
document.getElementById("uploadCloseBtn")?.addEventListener("click", () => {
  hideUploadPanel();
});

function hideUploadPanel() {
  const panel = document.getElementById("uploadPanel");
  if (panel) panel.classList.add("hidden");
}
  document.getElementById("uploadCloseBtn")?.addEventListener("click", () => {
  hideUploadPanel();
});

function createUploadRow(filename) {
  const list = document.getElementById("uploadList");
  if (!list) return null;

  const row = document.createElement("div");
  row.className = "upload-item";
  row.innerHTML = `
    <div class="upload-name">${filename}</div>
    <div class="upload-bar"><div></div></div>
    <div class="upload-meta">
      <span class="upload-pct">0%</span>
      <span class="upload-size">0 / 0</span>
    </div>
  `;
  list.appendChild(row);
  return row;
}

function setRowProgress(row, loaded, total) {
  const pct = total ? Math.round((loaded / total) * 100) : 0;
  row.querySelector(".upload-bar > div").style.width = pct + "%";
  row.querySelector(".upload-pct").textContent = pct + "%";
  row.querySelector(".upload-size").textContent =
    `${formatBytes(loaded)} / ${formatBytes(total)}`;
}

function markRowDone(row) {
  row.classList.add("done");
  row.querySelector(".upload-pct").textContent = "Done ✅";
}

function markRowFail(row) {
  row.classList.add("fail");
  row.querySelector(".upload-pct").textContent = "Failed ❌";
}

// ✅ Upload ONE file with progress using XHR (fetch cannot show progress)
function uploadSingleWithProgress(file, row) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file); // ✅ keep your existing backend route /files/upload

    const xhr = new XMLHttpRequest();
    const url = `${API_BASE}/files/upload?path=${encodeURIComponent(currentPath)}`;
    xhr.open("POST", url);

    // ✅ JWT header (same token you already use)
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (evt) => {
      if (!row) return;
      if (evt.lengthComputable) setRowProgress(row, evt.loaded, evt.total);
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch (_) {}

      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.detail || "Upload failed"));
    };

    xhr.send(fd);
  });
}

uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  // reset UI list
  const list = document.getElementById("uploadList");
  if (list) list.innerHTML = "";
  showUploadPanel();

  let success = 0;
  let failed = 0;

  // ✅ Upload one-by-one to show progress for each file
  for (const file of files) {
    const row = createUploadRow(file.name);

    try {
      await uploadSingleWithProgress(file, row);
      success++;
      markRowDone(row);
    } catch (err) {
      console.error(err);
      failed++;
      markRowFail(row);
    }
  }

  fileInput.value = ""; // allow selecting same files again
  loadDrive(); // refresh UI once

  if (failed === 0) {
    showToast(`Uploaded ${success} file(s) ✅`);
    setTimeout(hideUploadPanel, 2500);
  } else {
    showToast(`Uploaded ${success}, Failed ${failed} ❌`, true);
  }
});

// ---------- Create Folder ----------
newFolderBtn.addEventListener("click", () => {
  openPrompt(
    "New Folder",
    "Enter folder name:",
    "Folder name...",
    "",
    async (name) => {
      try {
        const res = await fetch(
  `${API_BASE}/files/folder?folder_name=${encodeURIComponent(name)}&path=${encodeURIComponent(currentPath)}`,
  {
    method: "POST",
    headers: authHeaders(),
  }
);


        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Create folder failed");

        showToast("Folder created ✅");
        loadDrive();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Create folder failed ❌", true);
      }
    }
  );
});



// ---------- Back ----------
backBtn.addEventListener("click", () => {
  if (!currentPath) return;
  const parts = currentPath.split("/");
  parts.pop();
  currentPath = parts.join("/");
  loadDrive();
});

// ---------- Empty Trash ----------
emptyTrashBtn.addEventListener("click", () => {
  openConfirm("Empty Trash", "Delete ALL items from trash permanently?", async () => {
   const res = await fetch(`${API_BASE}/files/trash/empty`, {
  method: "DELETE",
  headers: authHeaders(),
});
     const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Empty trash failed");
    showToast("Trash emptied ✅");
    loadDrive(); // stays in trash view
  });
});
// ---------- Restore All ----------
restoreAllBtn?.addEventListener("click", () => {
  openConfirm(
    "Restore All",
    "Restore ALL items from trash back to Drive?",
    async () => {
      try {
        const res = await fetch(`${API_BASE}/files/trash/restore-all`, {
          method: "POST",
          headers: authHeaders(),
        });

        let data = {};
        try { data = await res.json(); } catch (_) {}

        if (!res.ok) throw new Error(data.detail || "Restore all failed");

        showToast(`Restored ${data.restored || 0} item(s) ✅`);
        currentView = "trash";
        loadDrive();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Restore all failed ❌", true);
      }
    },
    "Restore All",
    "primary"
  );
});

// ---------- Viewer ----------
async function openViewer(filename, filePath = "") {
  const url = downloadUrl(filename, filePath || null);

  viewerTitle.textContent = filename;
  viewerBody.innerHTML = "";
  currentZoom = 1;

  const t = fileType(filename);

  try {
    // ✅ fetch file with Authorization and create blob url
    const blobUrl = await fetchAsBlobUrl(url);

  if (t === "image") {
    const img = document.createElement("img");
    img.src = blobUrl;
    img.style.maxWidth = "100%";
    img.style.transform = `scale(${currentZoom})`;
    img.style.transformOrigin = "top left";
    img.id = "previewElement";
    viewerBody.appendChild(img);
  } else if (filename.toLowerCase().endsWith(".pdf")) {
    const iframe = document.createElement("iframe");
    iframe.src = blobUrl;
    iframe.id = "previewElement";
    viewerBody.appendChild(iframe);
  } else if (t === "video") {
    const video = document.createElement("video");
    video.src = blobUrl;
    video.controls = true;
    video.style.width = "100%";
    video.style.height = "100%";
    viewerBody.appendChild(video);
  } else if (t === "audio") {
    const audio = document.createElement("audio");
    audio.src = blobUrl;
    audio.controls = true;
    audio.style.width = "100%";
    viewerBody.appendChild(audio);
  }else if (t === "doc") {
      // ✅ text-based docs preview
      const res = await fetch(url, { headers: authHeaders() });
      const text = await res.text();
      const pre = document.createElement("pre");
      pre.id = "previewElement";
      pre.style.whiteSpace = "pre-wrap";
      pre.style.wordBreak = "break-word";
      pre.textContent = text;
      viewerBody.appendChild(pre); 
  } else if (t === "office") {
  viewerBody.innerHTML = `
    <p style="color:#666;margin-bottom:10px;">
      Browser preview is not supported for this file type (DOCX/PPTX/XLSX).
    </p>
    <button class="btn primary" id="downloadBtn">Download</button>
  `;
  document.getElementById("downloadBtn").onclick = () => downloadWithAuth(url, filename);

}else {
  viewerBody.innerHTML = `
    <p style="color:#666;margin-bottom:10px;">Preview not supported.</p>
    <button class="btn primary" id="downloadBtn">Download</button>
  `;
  document.getElementById("downloadBtn").onclick = () => downloadWithAuth(url, filename);
}
  viewerModal.classList.add("open");
  //viewerModal.classList.remove("hidden");
}catch (err) {
    console.error(err);
    viewerBody.innerHTML = `
      <p style="color:#b00000;margin-bottom:10px;">Preview failed: ${err.message}</p>
      <button class="btn primary" id="downloadBtn">Download</button>
    `;
    document.getElementById("downloadBtn").onclick = () => downloadWithAuth(url, filename);
    viewerModal.classList.add("open");
  }
}

closeViewerBtn.addEventListener("click", () => {
  viewerModal.classList.remove("open");
  //viewerModal.classList.add("hidden");
  viewerBody.innerHTML = "";
});

detailsCloseBtn?.addEventListener("click", closeDetails);

detailsModal?.addEventListener("click", (e) => {
  if (e.target === detailsModal) closeDetails();
});



viewerModal.addEventListener("click", (e) => {
  if (e.target === viewerModal) {
    viewerModal.classList.remove("open");
    // viewerModal.classList.add("hidden");
    viewerBody.innerHTML = "";
  }
});

// zoom only for images
zoomInBtn.addEventListener("click", () => {
  const el = document.getElementById("previewElement");
  if (!el || el.tagName !== "IMG") return;
  currentZoom += 0.1;
  el.style.transform = `scale(${currentZoom})`;
});

zoomOutBtn.addEventListener("click", () => {
  const el = document.getElementById("previewElement");
  if (!el || el.tagName !== "IMG") return;
  currentZoom = Math.max(0.2, currentZoom - 0.1);
  el.style.transform = `scale(${currentZoom})`;
});

// thumbnails ke lia 
async function generateVideoThumbs() {
  const imgs = document.querySelectorAll("img.gen-video-thumb[data-video-thumb]");
  for (const img of imgs) {
    const url = img.dataset.videoThumb;

    try {
      const blobUrl = await fetchAsBlobUrl(url);

      const video = document.createElement("video");
      video.src = blobUrl;
      video.muted = true;
      video.playsInline = true;

      await new Promise((res, rej) => {
        video.addEventListener("loadeddata", res, { once: true });
        video.addEventListener("error", () => rej(new Error("Video load failed")), { once: true });
      });

      // seek to a better frame than 0.0 (optional)
      video.currentTime = Math.min(1, (video.duration || 2) * 0.1);

      await new Promise((res) => video.addEventListener("seeked", res, { once: true }));

      const vw = video.videoWidth || 320;
const vh = video.videoHeight || 180;

// keep aspect ratio, but limit size for performance
const maxW = 320;
const scale = Math.min(1, maxW / vw);

const canvas = document.createElement("canvas");
canvas.width = Math.round(vw * scale);
canvas.height = Math.round(vh * scale);

const ctx = canvas.getContext("2d");
ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

img.src = canvas.toDataURL("image/jpeg", 0.85);


      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // fallback icon
      img.outerHTML = "🎥";
    }
  }
}

async function generatePdfThumbs() {
  if (!window.pdfjsLib) return;

  // worker config
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";

  const imgs = document.querySelectorAll("img.gen-pdf-thumb[data-pdf-thumb]");
  for (const img of imgs) {
    const url = img.dataset.pdfThumb;

    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error("PDF fetch failed");

      const bytes = await res.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // scale to fit your thumb area nicely
      const targetW = 320;
      const scale = targetW / viewport.width;

      const scaled = page.getViewport({ scale });
      canvas.width = scaled.width;
      canvas.height = scaled.height;

      await page.render({ canvasContext: ctx, viewport: scaled }).promise;

      img.src = canvas.toDataURL("image/png");
    } catch (e) {
      img.outerHTML = "📄";
    }
  }
}

async function generateAudioDurations() {
  const spans = document.querySelectorAll("[data-audio-time]");
  for (const sp of spans) {
    const url = sp.dataset.audioTime;

    try {
      const blobUrl = await fetchAsBlobUrl(url);

      const audio = document.createElement("audio");
      audio.src = blobUrl;

      await new Promise((res, rej) => {
        audio.addEventListener("loadedmetadata", res, { once: true });
        audio.addEventListener("error", () => rej(new Error("Audio meta failed")), { once: true });
      });

      const sec = Math.floor(audio.duration || 0);
      const mm = String(Math.floor(sec / 60)).padStart(2, "0");
      const ss = String(sec % 60).padStart(2, "0");
      sp.textContent = `${mm}:${ss}`;

      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      sp.textContent = "--:--";
    }
  }
}



// ---------- Sidebar switching ----------
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    currentView = btn.dataset.view;
    clearSelection();
    // viewerModal.classList.remove("open");
    // viewerBody.innerHTML = "";

     if (currentView === "all") {
      currentPath = "";
      searchInput.value = ""; // optional: clear search
    }

    // reset path when switching to trash
    if (currentView === "trash") {
      currentPath = "";
    }
    loadDrive();
  });
});

function closeAllMenus() {
  document.querySelectorAll(".dropdown").forEach(d => d.classList.add("hidden"));
}

document.addEventListener("click", async (e) => {
  const menuBtn = e.target.closest(".menu-btn");
  const actionBtn = e.target.closest("[data-menu-action]");

  // open/close menu
  if (menuBtn) {
    e.preventDefault();
    e.stopPropagation();

    const dropdown = menuBtn.parentElement.querySelector(".dropdown");
    const isOpen = dropdown && !dropdown.classList.contains("hidden");

    closeAllMenus();
    if (dropdown && !isOpen) dropdown.classList.remove("hidden");
    return;
  }

  // click on menu option
  if (actionBtn) {
    e.preventDefault();
    e.stopPropagation();

    const action = actionBtn.dataset.menuAction;
    const name = actionBtn.dataset.name;

    closeAllMenus();

    // ✅ keep old functionality (click hidden buttons)
    if (action === "download") {
  const filePath = actionBtn.dataset.path || currentPath;
  const url = downloadUrl(name, filePath);
  await downloadWithAuth(url, name);   // ✅ secure download
  return;
    }

    if (action === "delete") {
  const filePath = actionBtn.dataset.path || currentPath;

  // if it's trash view
  if (currentView === "trash") {
    document.querySelector(`[data-trashdel="${CSS.escape(name)}"]`)?.click();
    return;
  }

  // file delete (works for search results too)
  deleteFile(name, filePath);
  return;
}
if (action === "cut") {
  const itemType = actionBtn.dataset.type || "file"; // you already pass data-type for rename, do same for cut
  const p = actionBtn.dataset.path || currentPath || "";
  const isFolder = itemType === "folder";

  setClipboard({
    mode: "cut",
    name,
    fromPath: p,
    isFolder
  });

  showToast(`Cut: ${name} ✅ `);
  return;
}

if (action === "copy") {
  const itemType = actionBtn.dataset.type || "file";
  const p = actionBtn.dataset.path || currentPath || "";
  const isFolder = itemType === "folder";

  setClipboard({
    mode: "copy",
    name,
    fromPath: p,
    isFolder
  });

  showToast(`Copied: ${name} ✅`);
  return;
}
if (action === "details") {
  const p = actionBtn.dataset.path || currentPath || "";

  // detect folder or file
  let isFolder = (actionBtn.dataset.type === "folder");

  // if type not present, detect folder using 📁 icon
  if (!actionBtn.dataset.type) {
    const card = actionBtn.closest(".file-card");
    const thumbText = card?.querySelector(".thumb")?.textContent || "";
    if (thumbText.includes("📁")) isFolder = true;
  }

  await openDetails(name, p, isFolder);
  return;
}


if (action === "rename") {
  const itemType = actionBtn.dataset.type; // "file" or "folder"
  const p = actionBtn.dataset.path || currentPath || "";
  const isFolder = itemType === "folder";

  openPrompt(
    "Rename",
    `Rename "${name}" to:`,
    "New name...",
    name,
    async (newName) => {
      try {
        await renameItem(name, newName, p, isFolder);

        // ✅ update local favStore so heart stays correct after rename
        const oldKey = `${(p || "").replace(/^\/+/, "")}/${name}`.replace(/^\/+/, "");
        const newKey = `${(p || "").replace(/^\/+/, "")}/${newName}`.replace(/^\/+/, "");

        favStore = favStore.map((x) => {
          const xKey = `${(x.path || "").replace(/^\/+/, "")}/${x.name}`.replace(/^\/+/, "");
          if (xKey === oldKey && Boolean(x.is_folder) === Boolean(isFolder)) {
            return { ...x, name: newName, path: p, is_folder: isFolder };
          }
          return x;
        });
        localStorage.setItem("favStore", JSON.stringify(favStore));

        showToast("Renamed ✅");
        loadDrive();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Rename failed ❌", true);
      }
    }
  );
  return;
}


 if (action === "share") {
  const itemType = actionBtn.dataset.type;   // "file" or "folder"
  const name = actionBtn.dataset.name;
  const p = actionBtn.dataset.path || "";

  const itemPath =
    itemType === "file"
      ? `${p}/${name}`.replace(/^\/+/, "")
      : p;

  openShareModal(itemType, itemPath);
  return;
}
  }

  // click outside closes menu
  closeAllMenus();
});

// ✅ FAVOURITE CLICK (Event Delegation) - Works after renderUploads too
filesGrid.addEventListener("click", async (e) => {
  const btn = e.target.closest(".fav-btn");
  if (!btn) return; // clicked somewhere else
  e.preventDefault();
  e.stopPropagation();

  const name = btn.dataset.favName;
  const path = btn.dataset.favPath || "";
  const isFolder = btn.dataset.favFolder === "true";

  console.log("FAV CLICK:", name, path, isFolder); // ✅ debug

  try {
    const res = await fetch(
  `${API_BASE}/files/favourite/toggle?name=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}&is_folder=${isFolder}`,
  {
    method: "POST",
    headers: authHeaders(),
  }
);


    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || "Favourite failed ❌", true);
      return;
    }

    // ✅ UI toggle (red + filled)
    // ✅ Toggle UI first
// ✅ TRUST BACKEND RESULT
const nowFav = data.favourite === true;

// lock button briefly to prevent double click
btn.disabled = true;

btn.classList.toggle("active", nowFav);
btn.innerHTML = heartIcon(nowFav);

// update local favStore
if (nowFav) {
  favStore.push({ name, path, is_folder: isFolder });
} else {
  favStore = favStore.filter(
    (x) =>
      !(
        x.name === name &&
        (x.path || "") === (path || "") &&
        Boolean(x.is_folder) === Boolean(isFolder)
      )
  );
}
localStorage.setItem("favStore", JSON.stringify(favStore));

// re-enable after UI update
setTimeout(() => (btn.disabled = false), 150);


// ✅ Update local favStore (so renderUploads can show correct hearts)
if (nowFav) {
  favStore.push({ name, path, is_folder: isFolder });
} else {
  favStore = favStore.filter(
    (x) =>
      !(
        x.name === name &&
        (x.path || "") === (path || "") &&
        Boolean(x.is_folder) === Boolean(isFolder)
      )
  );
}
localStorage.setItem("favStore", JSON.stringify(favStore));

// ✅ If you are inside favourites page and user removed ❤️,
// remove the card instantly
if (currentView === "favourites" && !nowFav) {
  btn.closest(".file-card")?.remove();
}

showFavToast(data.message || "Favourite updated ✅", false, 3000);



   

    // ✅ Refresh to update favourites page/list
    

  } catch (err) {
    console.error(err);
    showToast("Backend error ❌", true);
  }
});

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function setAccountName() {
  if (!accNameEl) return;

  const username = localStorage.getItem("username");
  accNameEl.textContent = username ? username : "Account";
}

// ===== Developer Emoji Eyes + Blink =====
function setupDevEmojiEyes() {
  if (!devEmoji) return;

  const pupils = devEmoji.querySelectorAll(".pupil");
  if (!pupils.length) return;

  const maxMove = 2.2; // movement inside eye

  document.addEventListener("mousemove", (e) => {
    pupils.forEach((pupil) => {
      const eye = pupil.closest(".eye");
      if (!eye) return;

      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const angle = Math.atan2(e.clientY - cy, e.clientX - cx);

      const offsetX = Math.cos(angle) * maxMove;
      const offsetY = Math.sin(angle) * maxMove;

      pupil.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });
  });
}

function blinkDevEmoji() {
  if (!devEmoji) return;

  const eyes = devEmoji.querySelectorAll(".dev-eye");
  if (!eyes.length) return;

  eyes.forEach((eye) => {
    eye.classList.remove("blinking");
    void eye.offsetWidth; // restart animation
    eye.classList.add("blinking");
  });

  setTimeout(() => {
    eyes.forEach((eye) => eye.classList.remove("blinking"));
  }, 220);
}

function setupDevEmojiBlink() {
  // Blink on click anywhere (except menus)
  document.addEventListener("click", (e) => {
    if (e.target.closest(".dropdown") || e.target.closest(".menu-btn")) return;
    blinkDevEmoji();
  });

  // Random natural blink 3–7 seconds
  (function loop() {
    const delay = 3000 + Math.random() * 4000;
    setTimeout(() => {
      blinkDevEmoji();
      loop();
    }, delay);
  })();
}


// logout buton 
logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
  localStorage.removeItem("access_token");
  localStorage.removeItem("jwt");
  localStorage.removeItem("username");
  localStorage.removeItem("favStore");
  window.location.href = "login.html";
});



// Refresh + Search
refreshBtn.addEventListener("click", loadDrive);
searchInput.addEventListener("input", debounce(loadDrive, 300));
sortBySelect.addEventListener("change", loadDrive);
orderSelect.addEventListener("change", loadDrive);
// ✅ Settings button (go to settings page)

document.getElementById("settingsBtn")?.addEventListener("click", () => {
  window.location.href = "./settings.html";
});
// ===== MULTI SELECT UI =====
const bulkBar = document.getElementById("bulkBar");
const bulkCount = document.getElementById("bulkCount");

function updateBulkUI(){
  bulkCount.textContent = `${selectedItems.length} selected`;
  bulkBar.classList.toggle("hidden", selectedItems.length === 0);

  // ✅ if user is in trash page
  const inTrash = (currentView === "trash");

  // ✅ Copy + Cut should NOT show in Trash
  document.getElementById("bulkCopy")?.classList.toggle("hidden", inTrash);
  document.getElementById("bulkCut")?.classList.toggle("hidden", inTrash);

  // ✅ Restore should ONLY show in Trash
  document.getElementById("bulkRestore")?.classList.toggle("hidden", !inTrash);
}


function clearSelection(){
  selectedItems.length = 0;
  document.querySelectorAll(".file-card.selected").forEach(c => c.classList.remove("selected"));
  updateBulkUI();
}


// attach handlers after render
function attachSelectHandlers(inTrash){
  document.querySelectorAll(".file-card").forEach(card => {
    const box = card.querySelector(".select-box");
    if (!box) return;

    const name = (card.querySelector(".file-name")?.childNodes?.[0]?.textContent || "").trim();
    const isFolder = (card.querySelector(".thumb")?.textContent || "").includes("📁");

    const deleteBtn = card.querySelector('[data-menu-action="delete"]');
    const path = deleteBtn?.dataset?.path || currentPath || "";

box.onclick = (e) => {
  e.preventDefault();
  e.stopPropagation();

  // ✅ AUTO enable multi-select when first time clicking any box
  if (!multiSelectOn) {
    multiSelectOn = true;
    document.body.classList.add("multi-select-on");
  }

  const idx = selectedItems.findIndex(x =>
    x.name===name && x.path===path && x.isFolder===isFolder && x.inTrash===inTrash
  );

  if (idx >= 0){
    selectedItems.splice(idx,1);
    card.classList.remove("selected");

    // ✅ if nothing selected, auto turn OFF
    if (selectedItems.length === 0) {
      multiSelectOn = false;
      document.body.classList.remove("multi-select-on");
    }

  } else {
    selectedItems.push({ name, path, isFolder, inTrash });
    card.classList.add("selected");
  }

  updateBulkUI();
};
  });
}
// bulk clear
document.getElementById("bulkClear")?.addEventListener("click", clearSelection);

document.getElementById("bulkCopy")?.addEventListener("click", () => {
  if (!selectedItems.length) return;
  setClipboard({ mode: "copy", items: [...selectedItems] });
  showToast(`Copied ${selectedItems.length} item(s) ✅`);
});

document.getElementById("bulkCut")?.addEventListener("click", () => {
  if (!selectedItems.length) return;
  setClipboard({ mode: "cut", items: [...selectedItems] });
  showToast(`Cut ${selectedItems.length} item(s) ✅`);
});
// bulk delete
document.getElementById("bulkDelete")?.addEventListener("click", () => {
  if (!selectedItems.length) return;

  const inTrash = (currentView === "trash");

  openConfirm(
    inTrash ? "Delete Permanently" : "Move to Trash",
    inTrash
      ? `Delete ${selectedItems.length} item(s) permanently?`
      : `Move ${selectedItems.length} item(s) to Trash?`,
    async () => {

      let success = 0;
      let failed = 0;

      for (const it of selectedItems) {
        try {
          const url = inTrash
            ? `${API_BASE}/files/trash/delete/${encodeURIComponent(it.name)}`
            : `${API_BASE}/files/file/${encodeURIComponent(it.name)}?path=${encodeURIComponent(it.path || "")}`;

          const res = await fetch(url, {
            method: "DELETE",
            headers: authHeaders(),
          });

          let data = {};
          try { data = await res.json(); } catch (_) {}

          if (!res.ok) {
            console.error("Bulk delete failed:", it.name, data);
            failed++;
          } else {
            success++;
          }
        } catch (e) {
          console.error("Bulk delete error:", it.name, e);
          failed++;
        }
      }

      if (success > 0 && failed === 0) showToast(`Deleted ${success} item(s) ✅`);
      else if (success > 0 && failed > 0) showToast(`Deleted ${success}, Failed ${failed} ⚠`, true);
      else showToast("Delete failed ❌", true);

      clearSelection();
      loadDrive();
    }
  );
});

// bulk restore
document.getElementById("bulkRestore")?.addEventListener("click", () => {
  if (!selectedItems.length) return;

  openConfirm("Restore Items", `Restore ${selectedItems.length} item(s)?`, async () => {
    for (const it of selectedItems) {
      try {
        await fetch(`${API_BASE}/files/trash/restore/${encodeURIComponent(it.name)}`, {
          method: "POST",
          headers: authHeaders(),
        });
      } catch (e) {
        console.error("Restore failed:", it, e);
      }
    }
    showToast("Bulk restore done ✅");
    clearSelection();
    loadDrive();
  }, "Restore", "primary");
});
async function loadTopAvatar() {
  if (!topAvatarImg || !devEmoji) return; // ✅ avoid crash

  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: authHeaders(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;

    if (data.avatar_url) {
      topAvatarImg.src = `${API_BASE}${data.avatar_url}?t=${Date.now()}`;
      topAvatarImg.style.display = "block";
      devEmoji.style.display = "none";
    } else {
      topAvatarImg.style.display = "none";
      devEmoji.style.display = "block";
    }
  } catch (err) {
    console.log("Avatar load failed:", err);
    topAvatarImg.style.display = "none";
    devEmoji.style.display = "block";
  }
}


// Start
setAccountName();
setupDevEmojiEyes();
setupDevEmojiBlink();
setClipboard(clipboard);
loadTopAvatar();
loadDrive();