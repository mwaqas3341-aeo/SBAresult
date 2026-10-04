// Routes between the auth card, the user dashboard, and the (completely
// separate) admin dashboard, and wires up every form/table in each.
window.currentAccount = { session: null, profile: null };

// ---------- Element refs ----------
const viewAuth = document.getElementById("view-auth");
const viewUser = document.getElementById("view-user");
const viewAdmin = document.getElementById("view-admin");
const topbarAccount = document.getElementById("topbar-account");
const topbarEmail = document.getElementById("topbar-email");

// ---------- Auth tabs ----------
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".auth-panel").forEach((p) => (p.hidden = true));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).hidden = false;
  });
});

function setFieldStatus(el, kind, message) {
  el.hidden = false;
  el.className = `status ${kind}`;
  el.textContent = message;
}

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ---------- Sign in / up / forgot ----------
document.getElementById("signin-btn").addEventListener("click", async () => {
  const el = document.getElementById("signin-status");
  const email = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;
  if (!email || !password) return setFieldStatus(el, "error", "Enter an email and password.");
  try {
    const { session } = await authSignIn(email, password);
    await enterSession(session);
  } catch (err) {
    setFieldStatus(el, "error", err.message || "Sign in failed.");
  }
});

document.getElementById("signup-btn").addEventListener("click", async () => {
  const el = document.getElementById("signup-status");
  const school_name = document.getElementById("signup-school").value.trim();
  const emis_or_registration_no = document.getElementById("signup-emis").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("signup-password-confirm").value;

  if (!school_name) return setFieldStatus(el, "error", "School Name is required.");
  if (!emis_or_registration_no) return setFieldStatus(el, "error", "Enter an EMIS code or Registration No.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return setFieldStatus(el, "error", "Enter a valid email address.");
  if (password.length < 6) return setFieldStatus(el, "error", "Password must be at least 6 characters.");
  if (password !== confirm) return setFieldStatus(el, "error", "Passwords do not match.");

  try {
    await authSignUp(email, password, { school_name, emis_or_registration_no });
    setFieldStatus(el, "success", "Account created with 5 free result card credits. Check your email to confirm, then sign in.");
  } catch (err) {
    setFieldStatus(el, "error", err.message || "Registration failed.");
  }
});

document.getElementById("forgot-btn").addEventListener("click", async () => {
  const el = document.getElementById("forgot-status");
  const email = document.getElementById("forgot-email").value.trim();
  if (!email) return setFieldStatus(el, "error", "Enter your email.");
  try {
    await authResetPassword(email);
    setFieldStatus(el, "success", "If that email has an account, a reset link has been sent.");
  } catch (err) {
    setFieldStatus(el, "error", err.message || "Could not send reset link.");
  }
});

document.getElementById("nav-signout").addEventListener("click", async (e) => {
  e.preventDefault();
  await authSignOut();
  enterLoggedOut();
});

// ---------- Session routing ----------
async function enterSession(session) {
  window.currentAccount.session = session;
  const profile = await getProfile(session.user.id);
  window.currentAccount.profile = profile;

  topbarAccount.hidden = false;
  topbarEmail.textContent = session.user.email;
  viewAuth.hidden = true;

  if (profile.is_admin) {
    viewUser.hidden = true;
    viewAdmin.hidden = false;
    await loadAdminDashboard();
  } else {
    viewAdmin.hidden = true;
    viewUser.hidden = false;
    populateUserDashboard(session, profile);
    await Promise.all([refreshHistory(session.user.id), refreshPayments(session.user.id)]);
  }
}

function enterLoggedOut() {
  window.currentAccount.session = null;
  window.currentAccount.profile = null;
  topbarAccount.hidden = true;
  viewAuth.hidden = false;
  viewUser.hidden = true;
  viewAdmin.hidden = true;
}

// ---------- User dashboard ----------
function populateUserDashboard(session, profile) {
  document.getElementById("dash-school").textContent = profile.school_name || "(not set)";
  document.getElementById("dash-emis").textContent = profile.emis_or_registration_no || "(not set)";
  document.getElementById("dash-package").textContent = profile.current_package;
  document.getElementById("dash-account-type").textContent = profile.account_type;
  document.getElementById("dash-remaining").textContent = profile.remaining_generations;
  document.getElementById("dash-total").textContent = profile.total_generations;
  document.getElementById("dash-used").textContent = profile.used_generations;

  document.getElementById("profile-school").value = profile.school_name || "";
  document.getElementById("profile-district").value = profile.district || "";
  document.getElementById("profile-emis").value = profile.emis_or_registration_no || "";
}

document.getElementById("profile-save-btn").addEventListener("click", async () => {
  const el = document.getElementById("profile-status");
  if (!window.currentAccount.session) return;
  try {
    const school_name = document.getElementById("profile-school").value.trim();
    const district = document.getElementById("profile-district").value.trim();
    const emis_or_registration_no = document.getElementById("profile-emis").value.trim();
    await saveProfile(window.currentAccount.session.user.id, { school_name, district, emis_or_registration_no });
    window.currentAccount.profile = { ...window.currentAccount.profile, school_name, district, emis_or_registration_no };
    document.getElementById("dash-school").textContent = school_name || "(not set)";
    document.getElementById("dash-emis").textContent = emis_or_registration_no || "(not set)";
    setFieldStatus(el, "success", "Saved.");
  } catch (err) {
    setFieldStatus(el, "error", err.message || "Could not save profile.");
  }
});

document.getElementById("change-password-btn").addEventListener("click", async () => {
  const el = document.getElementById("password-status");
  const pw = document.getElementById("new-password").value;
  if (pw.length < 6) return setFieldStatus(el, "error", "Password must be at least 6 characters.");
  try {
    await authUpdatePassword(pw);
    document.getElementById("new-password").value = "";
    setFieldStatus(el, "success", "Password updated.");
  } catch (err) {
    setFieldStatus(el, "error", err.message || "Could not update password.");
  }
});

async function refreshHistory(userId) {
  const body = document.getElementById("history-body");
  try {
    const rows = await listHistory(userId);
    body.innerHTML = rows.length
      ? rows.map((r) => `
          <tr>
            <td>${formatWhen(r.created_at)}</td>
            <td>${r.year || ""}</td>
            <td>${r.heading || ""}</td>
            <td>${r.student_count}</td>
            <td>${r.class_label || ""}</td>
            <td>${r.section_label || ""}</td>
          </tr>
        `).join("")
      : '<tr><td colspan="6" class="muted">No generations yet.</td></tr>';
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="muted">Could not load: ${err.message}</td></tr>`;
  }
}

async function refreshPayments(userId) {
  const body = document.getElementById("payments-body");
  try {
    const rows = await listOwnPayments(userId);
    body.innerHTML = rows.length
      ? rows.map((r) => `
          <tr>
            <td>${formatWhen(r.payment_date)}</td>
            <td>${r.package_key}</td>
            <td>Rs. ${r.amount}</td>
            <td>${r.result_cards_allowed}</td>
            <td>${r.payment_status}</td>
          </tr>
        `).join("")
      : '<tr><td colspan="5" class="muted">No payments yet.</td></tr>';
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="muted">Could not load: ${err.message}</td></tr>`;
  }
}

// Called by app.js right after a successful deduct_credits(), to keep the
// dashboard numbers and history table in sync without a full page reload.
function onCreditsDeducted(newRemaining) {
  const p = window.currentAccount.profile;
  if (!p) return;
  const used = p.total_generations - newRemaining;
  window.currentAccount.profile = { ...p, used_generations: used, remaining_generations: newRemaining };
  document.getElementById("dash-remaining").textContent = newRemaining;
  document.getElementById("dash-used").textContent = used;
  refreshHistory(window.currentAccount.session.user.id);
}

// ---------- Admin dashboard ----------
let adminProfilesCache = [];

async function loadAdminDashboard() {
  const [profiles, history] = await Promise.all([listAllProfiles(), listAllHistory()]);
  adminProfilesCache = profiles;

  const totalUsers = profiles.length;
  const freeUsers = profiles.filter((p) => p.account_type === "free").length;
  const paidUsers = profiles.filter((p) => p.account_type === "paid").length;
  const totalGenerated = history.reduce((sum, h) => sum + h.student_count, 0);
  const totalAllocated = profiles.reduce((sum, p) => sum + p.total_generations, 0);
  const totalUsed = profiles.reduce((sum, p) => sum + p.used_generations, 0);
  const totalRemaining = profiles.reduce((sum, p) => sum + p.remaining_generations, 0);
  const zeroCredit = profiles.filter((p) => p.remaining_generations <= 0).length;
  const lowCredit = profiles.filter((p) => p.remaining_generations > 0 && p.remaining_generations <= 5).length;

  document.getElementById("stat-total-users").textContent = totalUsers;
  document.getElementById("stat-free-users").textContent = freeUsers;
  document.getElementById("stat-paid-users").textContent = paidUsers;
  document.getElementById("stat-total-generated").textContent = totalGenerated;
  document.getElementById("stat-total-allocated").textContent = totalAllocated;
  document.getElementById("stat-total-used").textContent = totalUsed;
  document.getElementById("stat-total-remaining").textContent = totalRemaining;
  document.getElementById("stat-zero-credit").textContent = zeroCredit;
  document.getElementById("stat-low-credit").textContent = lowCredit;

  renderAdminUsersTable();

  try {
    const packages = await listPackages();
    const select = document.getElementById("admin-package-select");
    select.innerHTML = packages.map((p) => `<option value="${p.key}" data-price="${p.price}" data-credits="${p.credits}">${p.name} &ndash; Rs. ${p.price} (${p.credits} cards)</option>`).join("");
  } catch (err) {
    console.warn("Could not load packages:", err);
  }
}

function renderAdminUsersTable() {
  const search = document.getElementById("admin-search").value.trim().toLowerCase();
  const filter = document.getElementById("admin-filter").value;
  const body = document.getElementById("admin-users-body");

  let rows = adminProfilesCache;
  if (search) {
    rows = rows.filter((p) =>
      (p.school_name || "").toLowerCase().includes(search) ||
      (p.email || "").toLowerCase().includes(search) ||
      (p.emis_or_registration_no || "").toLowerCase().includes(search)
    );
  }
  if (filter === "free") rows = rows.filter((p) => p.account_type === "free");
  if (filter === "paid") rows = rows.filter((p) => p.account_type === "paid");
  if (filter === "zero") rows = rows.filter((p) => p.remaining_generations <= 0);
  if (filter === "remaining") rows = rows.filter((p) => p.remaining_generations > 0);

  body.innerHTML = rows.length
    ? rows.map((p) => `
        <tr>
          <td>${p.school_name || ""}</td>
          <td>${p.email || ""}</td>
          <td>${p.emis_or_registration_no || ""}</td>
          <td><span class="badge-pill badge-${p.account_type}">${p.account_type}</span></td>
          <td>${p.current_package}</td>
          <td>${p.total_generations}</td>
          <td>${p.used_generations}</td>
          <td>${p.remaining_generations}</td>
          <td>${formatWhen(p.created_at)}</td>
          <td><button class="btn-link" data-user-id="${p.id}">View</button></td>
        </tr>
      `).join("")
    : '<tr><td colspan="10" class="muted">No matching users.</td></tr>';

  body.querySelectorAll("button[data-user-id]").forEach((btn) => {
    btn.addEventListener("click", () => openAdminUserDetail(btn.dataset.userId));
  });
}

document.getElementById("admin-search").addEventListener("input", renderAdminUsersTable);
document.getElementById("admin-filter").addEventListener("change", renderAdminUsersTable);

async function openAdminUserDetail(userId) {
  const profile = adminProfilesCache.find((p) => p.id === userId);
  if (!profile) return;

  const card = document.getElementById("admin-detail-card");
  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "start" });

  document.getElementById("admin-detail-user-id").value = userId;
  document.getElementById("admin-detail-grid").innerHTML = `
    <div><span class="dash-label">School</span><span class="dash-value">${profile.school_name || ""}</span></div>
    <div><span class="dash-label">EMIS/Registration No.</span><span class="dash-value">${profile.emis_or_registration_no || ""}</span></div>
    <div><span class="dash-label">Email</span><span class="dash-value">${profile.email || ""}</span></div>
    <div><span class="dash-label">Account Type</span><span class="dash-value">${profile.account_type}</span></div>
    <div><span class="dash-label">Current Package</span><span class="dash-value">${profile.current_package}</span></div>
    <div><span class="dash-label">Total Credits</span><span class="dash-value">${profile.total_generations}</span></div>
    <div><span class="dash-label">Used</span><span class="dash-value">${profile.used_generations}</span></div>
    <div><span class="dash-label">Remaining</span><span class="dash-value">${profile.remaining_generations}</span></div>
  `;

  try {
    const [payments, history] = await Promise.all([listUserPayments(userId), listUserHistory(userId)]);
    document.querySelector("#admin-detail-payments tbody").innerHTML = payments.length
      ? payments.map((p) => `<tr><td>${formatWhen(p.payment_date)}</td><td>${p.package_key}</td><td>Rs. ${p.amount}</td><td>${p.result_cards_allowed}</td></tr>`).join("")
      : '<tr><td colspan="4" class="muted">No payments yet.</td></tr>';
    document.querySelector("#admin-detail-history tbody").innerHTML = history.length
      ? history.map((h) => `<tr><td>${formatWhen(h.created_at)}</td><td>${h.year || ""}</td><td>${h.heading || ""}</td><td>${h.student_count}</td></tr>`).join("")
      : '<tr><td colspan="4" class="muted">No generations yet.</td></tr>';
  } catch (err) {
    console.warn("Could not load user detail:", err);
  }
}

document.getElementById("admin-package-confirm-btn").addEventListener("click", async () => {
  const el = document.getElementById("admin-package-status");
  const userId = document.getElementById("admin-detail-user-id").value;
  const select = document.getElementById("admin-package-select");
  const packageKey = select.value;
  const price = Number(select.selectedOptions[0]?.dataset.price || 0);
  const notes = document.getElementById("admin-package-notes").value.trim();
  if (!userId || !packageKey) return;

  try {
    await adminAddPayment(userId, packageKey, price, notes);
    setFieldStatus(el, "success", "Payment recorded and credits added.");
    document.getElementById("admin-package-notes").value = "";
    await loadAdminDashboard();
    openAdminUserDetail(userId);
  } catch (err) {
    setFieldStatus(el, "error", err.message || "Could not record payment.");
  }
});

// ---------- Boot ----------
(async function initAccount() {
  try {
    const session = await getSession();
    if (session) await enterSession(session);
  } catch (err) {
    console.warn("Could not restore session:", err);
  }
})();
