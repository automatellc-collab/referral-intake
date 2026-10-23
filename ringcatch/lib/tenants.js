/**
 * Data access for multi-tenant call handling: look up which business owns a
 * dialed number, and record what happened on the call.
 */
const { supabase } = require("./supabase");

async function getTenantByPhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;
  const { data, error } = await supabase()
    .from("tenants")
    .select("*, industry_templates(*)")
    .eq("phone_number", phoneNumber)
    .eq("status", "live")
    .maybeSingle();
  if (error) {
    console.error("getTenantByPhoneNumber failed:", error.message);
    return null;
  }
  return data;
}

async function getTenantById(id) {
  if (!id) return null;
  const { data, error } = await supabase()
    .from("tenants")
    .select("*, industry_templates(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getTenantById failed:", error.message);
    return null;
  }
  return data;
}

async function createCallLog(tenantId, callerNumber) {
  const { data, error } = await supabase()
    .from("call_logs")
    .insert({ tenant_id: tenantId, caller_number: callerNumber })
    .select()
    .single();
  if (error) {
    console.error("createCallLog failed:", error.message);
    return null;
  }
  return data;
}

async function finishCallLog(callLogId, { transcript, summary, booked }) {
  if (!callLogId) return;
  const { error } = await supabase()
    .from("call_logs")
    .update({ transcript, summary, booked, ended_at: new Date().toISOString() })
    .eq("id", callLogId);
  if (error) console.error("finishCallLog failed:", error.message);
}

async function createBooking(tenantId, callLogId, details, slot) {
  const { error } = await supabase().from("bookings").insert({
    tenant_id: tenantId,
    call_log_id: callLogId,
    caller_name: details.name || null,
    caller_phone: details.phone || null,
    slot_start: slot?.startISO || null,
    slot_end: slot?.endISO || null,
    job_description: details.job || null,
  });
  if (error) console.error("createBooking failed:", error.message);
}

module.exports = { getTenantByPhoneNumber, getTenantById, createCallLog, finishCallLog, createBooking };
