// Exposes window.currentAccount = { session, profile } for app.js to read
// (e.g. to use the saved district, and to log a history entry after generating).
window.currentAccount = { session: null, profile: null };

const loggedOutEl = document.getElementById("account-logged-out");
const loggedInEl = document.getElementById("account-logged-in");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const authStatus = document.getElementById("auth-status");
const signInBtn = document.getElementById("auth-signin-btn");
const signUpBtn = document.getElementById("auth-signup-btn");
const signOutBtn = document.getElementById("auth-signout-btn");
const accountEmailEl = document.getElementById("account-email");
const profileSchoolInput = document.getElementById("profile-school");
const profileDistrictInput = document.getElementById("profile-district");
const profileSaveBtn = document.getElementById("profile-save-btn");
const profileStatus = document.getElementById("profile-status");
const historyBody = document.getElementById("history-body");

function showAuthStatus(kind, message) {
  authStatus.hidden = false;
  authStatus.className = `status ${kind}`;
  authStatus.textContent = message;
}

function showProfileStatus(kind, message) {
  profileStatus.hidden = false;
  profileStatus.className = `status ${kind}`;
  profileStatus.textContent = message;
  setTimeout(() => { profileStatus.hidden = true; }, 4000);
}

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function refreshHistory(userId) {
  try {
    const rows = await listHistory(userId);
    if (!rows.length) {
      historyBody.innerHTML = '<tr><td colspan="5" class="muted">No generations yet.</td></tr>';
      return;
    }
    historyBody.innerHTML = rows.map((r) => `
      <tr>
        <td>${formatWhen(r.created_at)}</td>
        <td>${r.student_count}</td>
        <td>${r.class_label || ""}</td>
        <td>${r.section_label || ""}</td>
        <td>${r.file_name || ""}</td>
      </tr>
    `).join("");
  } catch (err) {
    console.warn("Could not load history:", err);
  }
}

async function enterLoggedIn(session) {
  window.currentAccount.session = session;
  loggedOutEl.hidden = true;
  loggedInEl.hidden = false;
  document.getElementById("app-content").hidden = false;
  accountEmailEl.textContent = session.user.email;

  try {
    const profile = await getProfile(session.user.id);
    window.currentAccount.profile = profile;
    profileSchoolInput.value = profile.school_name || "";
    profileDistrictInput.value = profile.district || "";

    if (profile.is_admin) {
      document.getElementById("admin-card").hidden = false;
      refreshAdminPanel();
    }
  } catch (err) {
    console.warn("Could not load profile:", err);
  }

  refreshHistory(session.user.id);
}

async function refreshAdminPanel() {
  const profilesBody = document.getElementById("admin-profiles-body");
  const historyBody2 = document.getElementById("admin-history-body");
  try {
    const profiles = await listAllProfiles();
    profilesBody.innerHTML = profiles.length
      ? profiles.map((p) => `
          <tr>
            <td>${p.email || ""}</td>
            <td>${p.school_name || ""}</td>
            <td>${p.district || ""}</td>
            <td>${formatWhen(p.created_at)}</td>
          </tr>
        `).join("")
      : '<tr><td colspan="4" class="muted">No schools registered yet.</td></tr>';
  } catch (err) {
    profilesBody.innerHTML = `<tr><td colspan="4" class="muted">Could not load: ${err.message}</td></tr>`;
  }

  try {
    const rows = await listAllHistory();
    historyBody2.innerHTML = rows.length
      ? rows.map((r) => `
          <tr>
            <td>${formatWhen(r.created_at)}</td>
            <td>${r.student_count}</td>
            <td>${r.class_label || ""}</td>
            <td>${r.section_label || ""}</td>
            <td>${r.file_name || ""}</td>
          </tr>
        `).join("")
      : '<tr><td colspan="5" class="muted">No generations yet.</td></tr>';
  } catch (err) {
    historyBody2.innerHTML = `<tr><td colspan="5" class="muted">Could not load: ${err.message}</td></tr>`;
  }
}

function enterLoggedOut() {
  window.currentAccount.session = null;
  window.currentAccount.profile = null;
  loggedOutEl.hidden = false;
  loggedInEl.hidden = true;
  document.getElementById("admin-card").hidden = true;
  document.getElementById("app-content").hidden = true;
}

signUpBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) { showAuthStatus("error", "Enter an email and password first."); return; }
  try {
    await authSignUp(email, password);
    showAuthStatus("success", "Account created. Check your email to confirm, then sign in.");
  } catch (err) {
    showAuthStatus("error", err.message || "Sign up failed.");
  }
});

signInBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) { showAuthStatus("error", "Enter an email and password first."); return; }
  try {
    const { session } = await authSignIn(email, password);
    await enterLoggedIn(session);
  } catch (err) {
    showAuthStatus("error", err.message || "Sign in failed.");
  }
});

signOutBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  await authSignOut();
  enterLoggedOut();
});

profileSaveBtn.addEventListener("click", async () => {
  if (!window.currentAccount.session) return;
  try {
    const school_name = profileSchoolInput.value.trim();
    const district = profileDistrictInput.value.trim();
    await saveProfile(window.currentAccount.session.user.id, { school_name, district });
    window.currentAccount.profile = { school_name, district };
    showProfileStatus("success", "Saved.");
  } catch (err) {
    showProfileStatus("error", err.message || "Could not save settings.");
  }
});

(async function initAccount() {
  try {
    const session = await getSession();
    if (session) await enterLoggedIn(session);
  } catch (err) {
    console.warn("Could not restore session:", err);
  }
})();
