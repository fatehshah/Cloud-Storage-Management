const API_BASE = "http://127.0.0.1:8000";

const statusEl = document.getElementById("status");
const crumbsEl = document.getElementById("crumbs");
const gridEl = document.getElementById("grid");
const folderView = document.getElementById("folderView");
const fileView = document.getElementById("fileView");
const previewEl = document.getElementById("preview");
const btnDownload = document.getElementById("btnDownload");

let token = null;
let shareMeta = null;
let currentPath = ""; // inside shared folder

function getTokenFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get("t");
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setCrumbs() {
  if (!shareMeta) return;
  const base = shareMeta.item_path || "";
  const inside = currentPath ? ` / ${currentPath}` : "";
  crumbsEl.textContent = `${shareMeta.item_type.toUpperCase()} • ${base}${inside}`;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.detail || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function isImage(name) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}
function isPdf(name) {
  return /\.pdf$/i.test(name);
}

function showFilePreview(fileName, downloadUrl) {
  folderView.style.display = "none";
  fileView.style.display = "block";
  previewEl.innerHTML = "";

  btnDownload.style.display = "inline-block";
  btnDownload.onclick = () => window.open(downloadUrl, "_blank");

  if (isImage(fileName)) {
    const img = document.createElement("img");
    img.src = downloadUrl;
    previewEl.appendChild(img);
  } else if (isPdf(fileName)) {
    const iframe = document.createElement("iframe");
    iframe.src = downloadUrl;
    previewEl.appendChild(iframe);
  } else {
    previewEl.innerHTML = `<div class="muted">No preview for this file type. Use Download.</div>`;
  }
}

function renderFolder(items) {
  fileView.style.display = "none";
  folderView.style.display = "block";
  btnDownload.style.display = "none";
  gridEl.innerHTML = "";

  // Back button card if inside subfolder
  if (currentPath) {
    const back = document.createElement("div");
    back.className = "card";
    back.innerHTML = `<b>⬅ Back</b><div class="muted">Go up</div>`;
    back.onclick = () => {
      currentPath = currentPath.split("/").slice(0, -1).join("/");
      loadFolder();
    };
    gridEl.appendChild(back);
  }

  items.forEach((it) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<b>${it.type === "folder" ? "📁" : "📄"} ${it.name}</b>
                      <div class="muted">${it.type}</div>`;

    card.onclick = () => {
      if (it.type === "folder") {
        currentPath = currentPath ? `${currentPath}/${it.name}` : it.name;
        loadFolder();
      } else {
        const rel = currentPath ? `${currentPath}/${it.name}` : it.name;
        const downloadUrl = `${API_BASE}/s/${token}/download?path=${encodeURIComponent(rel)}`;
        showFilePreview(it.name, downloadUrl);
      }
    };

    gridEl.appendChild(card);
  });
}

async function loadFolder() {
  setStatus("Loading folder...");
  setCrumbs();

  const data = await apiGet(`/s/${token}/list?path=${encodeURIComponent(currentPath)}`);
  renderFolder(data.items || []);
  setStatus("");
  setCrumbs();
}

async function loadShare() {
  token = getTokenFromUrl();
  if (!token) {
    setStatus("Missing token. Open link like: shared.html?t=YOUR_TOKEN");
    return;
  }

  try {
    setStatus("Opening share...");
    shareMeta = await apiGet(`/s/${token}`);
    currentPath = "";
    setCrumbs();

    if (shareMeta.item_type === "file") {
      const fileName = (shareMeta.item_path || "").split("/").pop() || "file";
      const downloadUrl = `${API_BASE}/s/${token}/download`;
      showFilePreview(fileName, downloadUrl);
      setStatus("");
      setCrumbs();
    } else {    
      await loadFolder();
    }
  } catch (e) {
    setStatus(`❌ ${e.message}`);
  }
}

loadShare();
