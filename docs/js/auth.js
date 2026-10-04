// Thin wrapper around supabase-js covering: auth, the user's own profile/
// credits/history, and (for the admin account only - enforced server-side
// by RLS + SECURITY DEFINER RPCs, never just by hiding frontend buttons)
// cross-account admin queries and the manual payment/package RPC.
//
// The publishable key below is safe to expose in client-side code by design
// (Supabase's security model relies on Row Level Security policies and the
// SECURITY DEFINER RPCs in the database, not on hiding this key).
const SUPABASE_URL = "https://xgdyulaurpnpkluichpk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_csxw1FFjWzNA_8Q7UobVLw_NWepR-R5";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ---------- Auth ----------

async function authSignUp(email, password, { school_name, emis_or_registration_no }) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { school_name, emis_or_registration_no } },
  });
  if (error) throw error;
  return data;
}

async function authSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function authSignOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

async function authResetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.split("#")[0].split("?")[0],
  });
  if (error) throw error;
}

async function authUpdatePassword(newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}

function onAuthChange(callback) {
  sb.auth.onAuthStateChange((_event, session) => callback(session));
}

// ---------- Own profile ----------

async function getProfile(userId) {
  const { data, error } = await sb
    .from("school_profiles")
    .select("school_name, district, emis_or_registration_no, is_admin, account_type, current_package, total_generations, used_generations, remaining_generations")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || {
    school_name: "", district: "", emis_or_registration_no: "", is_admin: false,
    account_type: "free", current_package: "free",
    total_generations: 0, used_generations: 0, remaining_generations: 0,
  };
}

// Only school_name/district/emis_or_registration_no are grantable - credits,
// package and account_type can only change via the RPCs below (enforced by
// a column-level GRANT in the database, not just by this function's shape).
async function saveProfile(userId, { school_name, district, emis_or_registration_no }) {
  const { error } = await sb
    .from("school_profiles")
    .update({ school_name, district, emis_or_registration_no, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

// ---------- Packages ----------

async function listPackages() {
  const { data, error } = await sb
    .from("packages")
    .select("key, name, price, credits")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}

// ---------- Own history / payments ----------

async function listHistory(userId, limit = 15) {
  const { data, error } = await sb
    .from("generation_history")
    .select("created_at, student_count, class_label, section_label, file_name, year, heading")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function listOwnPayments(userId) {
  const { data, error } = await sb
    .from("payments")
    .select("payment_date, package_key, amount, result_cards_allowed, payment_status, notes")
    .eq("user_id", userId)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ---------- The actual security boundary: server-side credit deduction ----------
// Succeeds only if the caller's own remaining balance covers p_count; this is
// enforced inside the database (atomic UPDATE ... WHERE remaining >= p_count),
// not by anything the browser decides. Throws INSUFFICIENT_CREDITS otherwise.
async function deductCredits(p_count, { year = "", heading = "", class_label = "", section_label = "", file_name = "" } = {}) {
  const { data, error } = await sb.rpc("deduct_credits", {
    p_count, p_year: year, p_heading: heading,
    p_class_label: class_label, p_section_label: section_label, p_file_name: file_name,
  });
  if (error) throw error;
  return data; // new remaining balance
}

// ---------- Admin-only (RLS/RPC enforce this server-side regardless of what the UI shows) ----------

async function listAllProfiles() {
  const { data, error } = await sb
    .from("school_profiles")
    .select("id, email, school_name, district, emis_or_registration_no, account_type, current_package, total_generations, used_generations, remaining_generations, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function listAllHistory(limit = 200) {
  const { data, error } = await sb
    .from("generation_history")
    .select("created_at, student_count, class_label, section_label, file_name, year, heading, user_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function listUserPayments(userId) {
  const { data, error } = await sb
    .from("payments")
    .select("payment_date, package_key, amount, result_cards_allowed, payment_status, notes")
    .eq("user_id", userId)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function listUserHistory(userId) {
  const { data, error } = await sb
    .from("generation_history")
    .select("created_at, student_count, class_label, section_label, file_name, year, heading")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// The only way credits/package/account_type can ever change for someone
// else's account - authorization is re-checked inside the function itself
// (NOT_AUTHORIZED if the caller isn't an admin), independent of this client.
async function adminAddPayment(userId, packageKey, amount, notes = "") {
  const { error } = await sb.rpc("admin_add_payment", {
    p_user_id: userId, p_package_key: packageKey, p_amount: amount, p_notes: notes,
  });
  if (error) throw error;
}
