const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { action, user_id, metadata } = req.body || {};

    if (!action) {
      return res.status(400).json({ error: "Missing required field: action" });
    }

    // Try to get authenticated user if not provided
    let userId = user_id;
    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id || null;
    }

    const { error } = await supabase.from("user_activity").insert([
      {
        user_id: userId,
        action,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) throw error;

    console.log(`✅ Logged user action: ${action} (${userId || "anonymous"})`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Error logging action:", err);
    return res.status(500).json({ error: err.message });
  }
};
