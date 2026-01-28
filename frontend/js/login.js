const API_BASE = "http://127.0.0.1:8000";

// If already logged in → go straight to dashboard
window.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (token) {
    window.location.href = "index.html";
  }

  setupLoginForm();
  setupMouseFollow();
});

function setupLoginForm() {
  const form = document.getElementById("loginForm");
  const resultEl = document.getElementById("loginResult");
  const togglePassword = document.getElementById("togglePassword");
  const signupRedirect = document.getElementById("signupRedirect");

  togglePassword.addEventListener("click", () => {
    const input = document.getElementById("password");
    input.type = input.type === "password" ? "text" : "password";
  });

  signupRedirect.addEventListener("click", () => {
    window.location.href = "signup.html";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    resultEl.textContent = "";
    resultEl.className = "auth-result";

    const username = document.getElementById("username").value.trim().toLowerCase();
    const password = document.getElementById("password").value.trim();

    if (!username || !password) {
      resultEl.textContent = "Please enter username and password.";
      resultEl.classList.add("error");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        resultEl.textContent = data.detail || "Login failed";
        resultEl.classList.add("error");
        return;
      }
//  for storin g token and username
      if (data.access_token) {
  localStorage.setItem("token", data.access_token);

  // ✅ always save username from input (works even if backend doesn't return username)
  localStorage.setItem("username", username);
}
      resultEl.textContent = "Logged in successfully. Redirecting…";
      resultEl.classList.add("success");

      setTimeout(() => {
        window.location.href = "index.html";
      }, 500);
    } catch (err) {
      console.error(err);
      resultEl.textContent = "Backend not reachable.";
      resultEl.classList.add("error");
    }
  });
}

/* === Mouse-follow animation for characters and eyes === */

function setupMouseFollow() {
  const characters = document.querySelectorAll(".character");
  const pupils = document.querySelectorAll(".eye-pupil");

  if (!characters.length) return;

  document.addEventListener("mousemove", (e) => {
    const x = (e.clientX / window.innerWidth) - 0.5; // -0.5 to 0.5
    const y = (e.clientY / window.innerHeight) - 0.5;

    // Slight head movement (parallax)
    characters.forEach((char) => {
      const depth = parseFloat(char.dataset.depth || "10");
      const moveX = -x * depth;
      const moveY = -y * depth;
      char.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });

    // Eyes follow cursor
    pupils.forEach((pupil) => {
      const eye = pupil.parentElement;
      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      const distance = 4; // how far pupil moves inside eye

      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;

      pupil.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });
  });
}
