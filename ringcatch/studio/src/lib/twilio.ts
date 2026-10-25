const TWILIO_BASE = "https://api.twilio.com/2010-04-01";
const MESSAGING_BASE = "https://messaging.twilio.com/v1";

function authHeader(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

interface TwilioError {
  message?: string;
}

async function twilioFetch(url: string, init: RequestInit): Promise<any> {
  const resp = await fetch(url, {
    ...init,
    headers: { ...init.headers, authorization: authHeader() },
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = data as TwilioError;
    throw new Error(err.message || `Twilio request failed (${resp.status})`);
  }
  return data;
}

/** Find one available US local number with voice + SMS capability. */
export async function findAvailableNumber(): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const url =
    `${TWILIO_BASE}/Accounts/${sid}/AvailablePhoneNumbers/US/Local.json` +
    `?VoiceEnabled=true&SmsEnabled=true&PageSize=1`;
  const data = await twilioFetch(url, { method: "GET" });
  const match = data.available_phone_numbers?.[0];
  if (!match) throw new Error("No available phone numbers found");
  return match.phone_number as string;
}

/** Buy a number and point its voice webhook at the call engine. */
export async function purchaseNumber(
  phoneNumber: string,
  voiceUrl: string
): Promise<{ sid: string; phoneNumber: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const url = `${TWILIO_BASE}/Accounts/${sid}/IncomingPhoneNumbers.json`;
  const body = new URLSearchParams({
    PhoneNumber: phoneNumber,
    VoiceUrl: voiceUrl,
    VoiceMethod: "POST",
  });
  const data = await twilioFetch(url, { method: "POST", body });
  return { sid: data.sid as string, phoneNumber: data.phone_number as string };
}

/** Attach a purchased number to the shared messaging service for SMS. */
export async function attachToMessagingService(phoneNumberSid: string): Promise<void> {
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID!;
  const url = `${MESSAGING_BASE}/Services/${serviceSid}/PhoneNumbers`;
  const body = new URLSearchParams({ PhoneNumberSid: phoneNumberSid });
  await twilioFetch(url, { method: "POST", body });
}
