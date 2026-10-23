import type { IndustryTemplate } from "@/lib/types";

interface Props {
  templates: IndustryTemplate[];
  value: string;
  onChange: (slug: string) => void;
}

export default function TemplatePicker({ templates, value, onChange }: Props) {
  return (
    <section>
      <h2 className="text-lg font-semibold">What kind of business is this?</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Pre-fills services, FAQs, and call-flow rules you can edit below.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {templates.map((t) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => onChange(t.slug)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
              value === t.slug
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {t.display_name}
          </button>
        ))}
      </div>
    </section>
  );
}
