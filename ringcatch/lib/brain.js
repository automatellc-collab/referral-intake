/**
 * The brain compiler: turns one tenant's filled-in fields + their industry
 * template into the system prompt the call engine already knows how to use.
 * This is the one piece that changes per business — the engine (slice2_5.js)
 * stays identical for every tenant.
 */

function formatHours(hours) {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const label = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  const parts = days
    .filter((d) => hours && hours[d] && hours[d].open && hours[d].close)
    .map((d) => `${label[d]} ${hours[d].open}-${hours[d].close}`);
  return parts.length ? parts.join(", ") : "hours not set";
}

function formatServices(services) {
  if (!Array.isArray(services) || services.length === 0) return "ask the caller what they need";
  return services
    .map((s) => (s.price_range ? `${s.name} (${s.price_range})` : s.name))
    .join("; ");
}

function formatFaqs(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return "";
  return "\n\nFAQs you can answer directly:\n" + faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n");
}

function greetingFor(tenant) {
  if (tenant.greeting_override) return tenant.greeting_override;
  return `Thanks for calling ${tenant.business_name}. The owner's not available right now, but I can help. What can we do for you?`;
}

/**
 * @param {object} tenant - a tenants row with its joined industry_templates row
 * @param {Array} slots - booking windows from calendar.js, or [] if booking is off
 */
function buildSystemPrompt(tenant, slots = []) {
  const template = tenant.industry_templates || {};
  const faqs = [...(template.default_faqs || []), ...(tenant.faqs || [])];
  const services = tenant.services?.length ? tenant.services : template.default_services || [];

  const bookingBlock = tenant.booking_enabled && slots.length
    ? `\n\nBooking: once you have the name AND callback number AND the job, offer these windows: ` +
      `${slots.map((s) => `${s.id}) ${s.label}`).join("; ")}. Offer them by their words, not by number. ` +
      `When the caller picks one, confirm it in words and then output [[BOOK n]] at the very end of that message. Only one [[BOOK]].`
    : "";

  const transferBlock = tenant.transfer_enabled && tenant.transfer_keywords?.length
    ? `\n\nUrgent escalation: if the caller mentions any of [${tenant.transfer_keywords.join(", ")}], ` +
      `treat it as urgent — say the owner will be notified immediately, then still collect name and callback number.`
    : "";

  return (
    `You are the friendly phone receptionist for ${tenant.business_name}. ` +
    `You are speaking OUT LOUD on a phone call.\n\n` +
    `${template.prompt_fragment || "Find out what the caller needs."}\n\n` +
    `Tone: ${tenant.tone || "friendly"}. One or two SHORT sentences per reply. No lists, no markdown, no emojis. ` +
    `One question at a time. Never invent prices beyond the ranges given below.${bookingBlock}${transferBlock}\n\n` +
    `Ending: once you have at least the caller's name and callback number (and you've booked or offered to book), ` +
    `thank them by name, say the owner will follow up, give a brief goodbye, then output [[END]] at the very end. ` +
    `Never output [[END]] before you have at least the name and callback number.\n\n` +
    `Business info — hours: ${formatHours(tenant.hours)}. Services: ${formatServices(services)}. ` +
    `Service area: ${tenant.service_area || "ask the caller for their location"}.` +
    `${tenant.custom_rules ? `\n\nSpecial instructions from the owner: ${tenant.custom_rules}` : ""}` +
    `${formatFaqs(faqs)}`
  );
}

module.exports = { buildSystemPrompt, greetingFor, formatHours, formatServices };
