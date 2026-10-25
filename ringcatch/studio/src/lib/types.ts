export interface ServiceItem {
  name: string;
  price_range: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface DayHours {
  open: string;
  close: string;
}

export type Hours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>>;

export type TenantStatus = "draft" | "live" | "paused";
export type TenantPlan = "starter" | "pro" | "premium";
export type BookingProvider = "mock" | "google_calendar" | "calendly" | "acuity";

export interface IndustryTemplate {
  slug: string;
  display_name: string;
  default_services: ServiceItem[];
  default_faqs: FaqItem[];
  prompt_fragment: string;
  sort_order: number;
}

export interface Tenant {
  id: string;
  owner_email: string;
  business_name: string;
  industry_template: string;
  phone_number: string | null;
  owner_phone: string | null;
  status: TenantStatus;
  plan: TenantPlan;
  hours: Hours;
  services: ServiceItem[];
  service_area: string;
  tone: string;
  greeting_override: string | null;
  custom_rules: string | null;
  languages: string[];
  faqs: FaqItem[];
  booking_enabled: boolean;
  booking_provider: BookingProvider;
  transfer_enabled: boolean;
  transfer_keywords: string[];
  recording_consent_enabled: boolean;
  notification_channels: { sms?: boolean };
  twilio_number_sid: string | null;
  provisioning_status: "idle" | "provisioning" | "active" | "failed";
  provisioning_error: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: "inactive" | "active" | "past_due" | "canceled";
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  tenant_id: string;
  caller_number: string | null;
  started_at: string;
  ended_at: string | null;
  transcript: string | null;
  summary: string | null;
  booked: boolean;
}

export interface Booking {
  id: string;
  tenant_id: string;
  call_log_id: string | null;
  caller_name: string | null;
  caller_phone: string | null;
  slot_start: string | null;
  slot_end: string | null;
  job_description: string | null;
  status: string;
  created_at: string;
}

export const PLAN_LABELS: Record<TenantPlan, string> = {
  starter: "Starter — $49/mo",
  pro: "Pro — $149/mo",
  premium: "Premium — $299/mo",
};
