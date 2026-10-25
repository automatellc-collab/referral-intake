"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TemplatePicker from "./TemplatePicker";
import HoursEditor from "./HoursEditor";
import TwoFieldListEditor from "./TwoFieldListEditor";
import FeatureToggles from "./FeatureToggles";
import type {
  BookingProvider, FaqItem, Hours, IndustryTemplate, ServiceItem, Tenant, TenantPlan,
} from "@/lib/types";
import { PLAN_LABELS } from "@/lib/types";

interface Props {
  templates: IndustryTemplate[];
  tenant: Tenant | null;
  ownerEmail: string;
}

export default function WizardForm({ templates, tenant, ownerEmail }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [templateSlug, setTemplateSlug] = useState(tenant?.industry_template || "");
  const [businessName, setBusinessName] = useState(tenant?.business_name || "");
  const [ownerPhone, setOwnerPhone] = useState(tenant?.owner_phone || "");
  const [phoneNumber, setPhoneNumber] = useState(tenant?.phone_number || "");
  const [provisioning, setProvisioning] = useState(false);
  const [hours, setHours] = useState<Hours>(tenant?.hours || {});
  const [services, setServices] = useState<ServiceItem[]>(tenant?.services || []);
  const [faqs, setFaqs] = useState<FaqItem[]>(tenant?.faqs || []);
  const [serviceArea, setServiceArea] = useState(tenant?.service_area || "");
  const [tone, setTone] = useState(tenant?.tone || "friendly");
  const [greetingOverride, setGreetingOverride] = useState(tenant?.greeting_override || "");
  const [customRules, setCustomRules] = useState(tenant?.custom_rules || "");
  const [plan, setPlan] = useState<TenantPlan>(tenant?.plan || "starter");

  const [bookingEnabled, setBookingEnabled] = useState(tenant?.booking_enabled || false);
  const [bookingProvider, setBookingProvider] = useState<BookingProvider>(tenant?.booking_provider || "mock");
  const [transferEnabled, setTransferEnabled] = useState(tenant?.transfer_enabled || false);
  const [transferKeywords, setTransferKeywords] = useState((tenant?.transfer_keywords || []).join(", "));
  const [recordingConsentEnabled, setRecordingConsentEnabled] = useState(tenant?.recording_consent_enabled ?? true);
  const [smsNotifications, setSmsNotifications] = useState(tenant?.notification_channels?.sms ?? true);

  function handleTemplateChange(slug: string) {
    setTemplateSlug(slug);
    if (services.length === 0 || faqs.length === 0) {
      const t = templates.find((tpl) => tpl.slug === slug);
      if (t) {
        if (services.length === 0) setServices(t.default_services);
        if (faqs.length === 0) setFaqs(t.default_faqs);
      }
    }
  }

  async function save(nextStatus?: "draft" | "live") {
    setSaving(true);
    setError("");
    const supabase = createClient();

    // Going live provisions a real phone number — the API route sets status
    // itself once that succeeds, so don't claim "live" here before it's true.
    const goingLive = nextStatus === "live";

    const payload = {
      owner_email: ownerEmail,
      business_name: businessName,
      industry_template: templateSlug,
      owner_phone: ownerPhone || null,
      phone_number: phoneNumber || null,
      hours,
      services,
      faqs,
      service_area: serviceArea,
      tone,
      greeting_override: greetingOverride || null,
      custom_rules: customRules || null,
      plan,
      booking_enabled: bookingEnabled,
      booking_provider: bookingProvider,
      transfer_enabled: transferEnabled,
      transfer_keywords: transferKeywords.split(",").map((s) => s.trim()).filter(Boolean),
      recording_consent_enabled: recordingConsentEnabled,
      notification_channels: { sms: smsNotifications },
      ...(nextStatus && !goingLive ? { status: nextStatus } : {}),
    };

    const query = tenant
      ? supabase.from("tenants").update(payload).eq("id", tenant.id).select().single()
      : supabase.from("tenants").insert(payload).select().single();
    const { data: savedTenant, error: saveError } = await query;

    if (saveError) {
      setSaving(false);
      setError(saveError.message);
      return;
    }

    if (!goingLive) {
      setSaving(false);
      router.push("/dashboard");
      router.refresh();
      return;
    }

    if (savedTenant?.phone_number) {
      // Already provisioned (editing a live tenant) — nothing more to do.
      setSaving(false);
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setProvisioning(true);
    try {
      const resp = await fetch("/api/provision-number", { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Couldn't assign a phone number — try again in a moment.");
        return;
      }
      setPhoneNumber(data.phoneNumber);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach the provisioning service — try again in a moment.");
    } finally {
      setSaving(false);
      setProvisioning(false);
    }
  }

  const canSave = businessName.trim() && templateSlug;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Build your AI receptionist</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Fill in the basics — you can change any of this later.
        </p>
      </div>

      <TemplatePicker templates={templates} value={templateSlug} onChange={handleTemplateChange} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Business basics</h2>
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Business name"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          value={ownerPhone}
          onChange={(e) => setOwnerPhone(e.target.value)}
          placeholder="Your cell, for call summaries (e.g. +14045551234)"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <div className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500">
          {phoneNumber
            ? <span className="text-neutral-900">Phone number: {phoneNumber}</span>
            : "Phone number: assigned automatically when you go live"}
        </div>
        <input
          value={serviceArea}
          onChange={(e) => setServiceArea(e.target.value)}
          placeholder="Service area (e.g. greater Marietta and Atlanta)"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="friendly">Friendly</option>
          <option value="formal">Formal</option>
          <option value="casual">Casual</option>
        </select>
        <textarea
          value={greetingOverride}
          onChange={(e) => setGreetingOverride(e.target.value)}
          placeholder="Custom greeting (optional — leave blank for the default)"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
        />
        <textarea
          value={customRules}
          onChange={(e) => setCustomRules(e.target.value)}
          placeholder="Anything else it should always do or never do (optional)"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
        />
      </section>

      <HoursEditor value={hours} onChange={setHours} />

      <TwoFieldListEditor
        title="Services & pricing"
        helpText="Price ranges only — it will never quote an exact price."
        rows={services}
        fieldA="name"
        fieldB="price_range"
        placeholderA="Service name"
        placeholderB="Price range"
        emptyRow={{ name: "", price_range: "" }}
        onChange={setServices}
      />

      <TwoFieldListEditor
        title="Custom FAQs"
        helpText="Beyond what the template already covers."
        rows={faqs}
        fieldA="q"
        fieldB="a"
        placeholderA="Question"
        placeholderB="Answer"
        emptyRow={{ q: "", a: "" }}
        onChange={setFaqs}
      />

      <FeatureToggles
        bookingEnabled={bookingEnabled}
        bookingProvider={bookingProvider}
        transferEnabled={transferEnabled}
        transferKeywords={transferKeywords}
        recordingConsentEnabled={recordingConsentEnabled}
        smsNotifications={smsNotifications}
        onChange={(patch) => {
          if (patch.bookingEnabled !== undefined) setBookingEnabled(patch.bookingEnabled);
          if (patch.bookingProvider !== undefined) setBookingProvider(patch.bookingProvider);
          if (patch.transferEnabled !== undefined) setTransferEnabled(patch.transferEnabled);
          if (patch.transferKeywords !== undefined) setTransferKeywords(patch.transferKeywords);
          if (patch.recordingConsentEnabled !== undefined) setRecordingConsentEnabled(patch.recordingConsentEnabled);
          if (patch.smsNotifications !== undefined) setSmsNotifications(patch.smsNotifications);
        }}
      />

      <section>
        <h2 className="text-lg font-semibold">Plan</h2>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as TenantPlan)}
          className="mt-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {Object.entries(PLAN_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={() => save()}
          className="rounded-lg border border-neutral-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Save as draft
        </button>
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={() => save("live")}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {provisioning ? "Assigning your phone number…" : "Save & go live"}
        </button>
      </div>
    </div>
  );
}
