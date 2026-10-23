import type { BookingProvider } from "@/lib/types";

interface Props {
  bookingEnabled: boolean;
  bookingProvider: BookingProvider;
  transferEnabled: boolean;
  transferKeywords: string;
  recordingConsentEnabled: boolean;
  smsNotifications: boolean;
  onChange: (patch: Partial<{
    bookingEnabled: boolean;
    bookingProvider: BookingProvider;
    transferEnabled: boolean;
    transferKeywords: string;
    recordingConsentEnabled: boolean;
    smsNotifications: boolean;
  }>) => void;
}

function Toggle({ checked, onChange, label, children }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      <label className="flex items-center justify-between gap-3 text-sm font-medium">
        {label}
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {checked && children}
    </div>
  );
}

export default function FeatureToggles(props: Props) {
  const { onChange } = props;
  return (
    <section>
      <h2 className="text-lg font-semibold">Call flow</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Toggle
          checked={props.bookingEnabled}
          onChange={(v) => onChange({ bookingEnabled: v })}
          label="Let it book appointments"
        >
          <select
            value={props.bookingProvider}
            onChange={(e) => onChange({ bookingProvider: e.target.value as BookingProvider })}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="mock">No calendar yet (test mode)</option>
            <option value="google_calendar">Google Calendar</option>
            <option value="calendly">Calendly</option>
            <option value="acuity">Acuity</option>
          </select>
        </Toggle>

        <Toggle
          checked={props.transferEnabled}
          onChange={(v) => onChange({ transferEnabled: v })}
          label="Flag urgent calls"
        >
          <input
            value={props.transferKeywords}
            onChange={(e) => onChange({ transferKeywords: e.target.value })}
            placeholder="e.g. flooding, gas leak, no heat"
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
          <p className="text-xs text-neutral-500">Comma-separated keywords that mean &quot;treat as urgent.&quot;</p>
        </Toggle>

        <Toggle
          checked={props.recordingConsentEnabled}
          onChange={(v) => onChange({ recordingConsentEnabled: v })}
          label="Play call-recording disclosure"
        >
          <p className="text-xs text-neutral-500">
            Check your state&apos;s consent laws — some require this.
          </p>
        </Toggle>

        <Toggle
          checked={props.smsNotifications}
          onChange={(v) => onChange({ smsNotifications: v })}
          label="Text me a summary after each call"
        />
      </div>
    </section>
  );
}
