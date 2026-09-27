// Each school/teacher gets an account (Supabase Auth) with a saved profile
// (school name, district) and a history list of past generations.
//
// The publishable key below is safe to expose in client-side code by design
// (Supabase's security model relies on Row Level Security policies in the
// database, not on hiding this key) - see supabase.com/docs/guides/api/api-keys.
const SUPABASE_URL = "https://xgdyulaurpnpkluichpk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_csxw1FFjWzNA_8Q7UobVLw_NWepR-R5";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function authSignUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
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

async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}

function onAuthChange(callback) {
  sb.auth.onAuthStateChange((_event, session) => callback(session));
}

async function getProfile(userId) {
  const { data, error } = await sb
    .from("school_profiles")
    .select("school_name, district, is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || { school_name: "", district: "", is_admin: false };
}

async function saveProfile(userId, { school_name, district }) {
  const { error } = await sb
    .from("school_profiles")
    .update({ school_name, district, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

async function listHistory(userId, limit = 15) {
  const { data, error } = await sb
    .from("generation_history")
    .select("created_at, student_count, class_label, section_label, file_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function addHistoryEntry(userId, entry) {
  // Best-effort - a failure here should never block a result card download.
  try {
    await sb.from("generation_history").insert({ user_id: userId, ...entry });
  } catch (err) {
    console.warn("Could not save history entry:", err);
  }
}

// Admin-only (RLS only returns rows across all accounts when the caller's
// own profile has is_admin = true; anyone else just gets their own row back).
async function listAllProfiles() {
  const { data, error } = await sb
    .from("school_profiles")
    .select("email, school_name, district, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function listAllHistory(limit = 100) {
  const { data, error } = await sb
    .from("generation_history")
    .select("created_at, student_count, class_label, section_label, file_name, user_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
