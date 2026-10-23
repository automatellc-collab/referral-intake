interface Row {
  [key: string]: string;
}

interface Props<T extends Row> {
  title: string;
  helpText?: string;
  rows: T[];
  fieldA: keyof T;
  fieldB: keyof T;
  placeholderA: string;
  placeholderB: string;
  emptyRow: T;
  onChange: (rows: T[]) => void;
}

export default function TwoFieldListEditor<T extends Row>({
  title,
  helpText,
  rows,
  fieldA,
  fieldB,
  placeholderA,
  placeholderB,
  emptyRow,
  onChange,
}: Props<T>) {
  function update(index: number, field: keyof T, val: string) {
    const next = rows.map((r, i) => (i === index ? { ...r, [field]: val } : r));
    onChange(next);
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {helpText && <p className="mt-1 text-sm text-neutral-500">{helpText}</p>}
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={row[fieldA] as string}
              onChange={(e) => update(i, fieldA, e.target.value)}
              placeholder={placeholderA}
              className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
            <input
              value={row[fieldB] as string}
              onChange={(e) => update(i, fieldB, e.target.value)}
              placeholder={placeholderB}
              className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-md border border-neutral-300 px-2 text-sm text-neutral-500 hover:border-red-400 hover:text-red-500"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...rows, emptyRow])}
          className="self-start text-sm font-medium text-neutral-700 underline"
        >
          + Add
        </button>
      </div>
    </section>
  );
}
