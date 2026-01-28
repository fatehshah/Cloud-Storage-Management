const API_BASE = "http://127.0.0.1:8000";

window.addEventListener("DOMContentLoaded", () => {
  // If already logged in → go to dashboard
  if (localStorage.getItem("token")) {
    window.location.href = "index.html";
    return;
  }

  setupSignupForm();
  setupMouseFollow();
});

function setupSignupForm() {
  const form = document.getElementById("signupForm");
   if (!form) {
    console.error("❌ signupForm not found");
    return;
  }
  const resultEl = document.getElementById("signupResult");
  const togglePassword = document.getElementById("togglePassword");
  const loginRedirect = document.getElementById("loginRedirect");
  const dobEl = document.getElementById("dob");
  const ageHint = document.getElementById("ageHint");
  const signupBtn = document.getElementById("signupBtn");

  togglePassword.addEventListener("click", () => {
    const input = document.getElementById("password");
    input.type = input.type === "password" ? "text" : "password";
  });

  loginRedirect.addEventListener("click", () => {
    window.location.href = "login.html";
  });

  // Age restriction UI (>= 12)
  function calculateAge(dobStr) {
    const dob = new Date(dobStr);
    if (Number.isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }

  function validateAgeUI() {
    ageHint.textContent = "";
    ageHint.className = "auth-hint";
    signupBtn.disabled = false;

    const dobVal = dobEl?.value;
    if (!dobVal) return true;

    const age = calculateAge(dobVal);
    if (age === null) return false;

    if (age < 12) {
      ageHint.textContent = "You must be 12 or older to create an account.";
      ageHint.classList.add("error");
      signupBtn.disabled = true;
      return false;
    }

    ageHint.textContent = `Age: ${age}`;
    return true;
  }

  if (dobEl) {
    dobEl.addEventListener("change", validateAgeUI);
    dobEl.addEventListener("input", validateAgeUI);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    resultEl.textContent = "";
    resultEl.className = "auth-result";

    const username = document.getElementById("username").value.trim().toLowerCase();
    const firstName = (document.getElementById("firstName")?.value || "").trim();
    const lastName = (document.getElementById("lastName")?.value || "").trim();
    const dob = (document.getElementById("dob")?.value || "").trim();
    const gender = (document.getElementById("gender")?.value || "").trim();
    const email = (document.getElementById("email")?.value || "").trim();
    const phone = (document.getElementById("phone")?.value || "").trim();

    const password = document.getElementById("password").value.trim();
    const confirmPassword = document.getElementById("confirmPassword").value.trim();

    const driveMode = document.querySelector('input[name="driveMode"]:checked')?.value || "private";
    const canShare = driveMode === "share";

    // Required checks
    if (!username || !firstName || !lastName || !dob || !gender || !password || !confirmPassword) {
      resultEl.textContent = "Please fill all required fields.";
      resultEl.classList.add("error");
      return;
    }

    // Age gate
    const age = calculateAge(dob);
    if (age === null) {
      resultEl.textContent = "Please enter a valid date of birth.";
      resultEl.classList.add("error");
      return;
    }
    if (age < 12) {
      resultEl.textContent = "You must be 12 or older to create an account.";
      resultEl.classList.add("error");
      return;
    }

    // Email/phone rule suggestion: at least one contact method
    if (!email && !phone) {
      resultEl.textContent = "Please provide at least an email or a phone number.";
      resultEl.classList.add("error");
      return;
    }

    // Basic email check (optional)
    if (email && !email.includes("@")) {
      resultEl.textContent = "Please enter a valid email.";
      resultEl.classList.add("error");
      return;
    }

    // Basic phone check (optional, very light)
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10) {
        resultEl.textContent = "Please enter a valid phone number (at least 10 digits).";
        resultEl.classList.add("error");
        return;
      }
    }

    if (password.length < 4) {
      resultEl.textContent = "Password must be at least 4 characters.";
      resultEl.classList.add("error");
      return;
    }

    if (password !== confirmPassword) {
      resultEl.textContent = "Passwords do not match.";
      resultEl.classList.add("error");
      return;
    }

    // Save profile + mode locally for concept demo (until backend stores it)
    const signupProfile = {
      username,
      firstName,
      lastName,
      dob,
      gender,
      email,
      phone,
      canShare,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(`profile_${username}`, JSON.stringify(signupProfile));

    console.log("Sending signup request to:", `${API_BASE}/auth/signup`);

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Backend currently expects only username/password:
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        resultEl.textContent = data.detail || "Signup failed";
        resultEl.classList.add("error");
        return;
      }

      resultEl.textContent = "Account created ✅ Redirecting to login...";
      resultEl.classList.add("success");

      setTimeout(() => {
        window.location.href = "login.html";
      }, 800);
    } catch (err) {
      console.error("Signup error:", err);
      resultEl.textContent = "Backend not reachable ❌ (check server + console)";
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
    const x = (e.clientX / window.innerWidth) - 0.5;
    const y = (e.clientY / window.innerHeight) - 0.5;

    characters.forEach((char) => {
      const depth = parseFloat(char.dataset.depth || "10");
      const moveX = -x * depth;
      const moveY = -y * depth;
      char.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });

    pupils.forEach((pupil) => {
      const eye = pupil.parentElement;
      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
      const distance = 4;

      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;

      pupil.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });
  });
}
