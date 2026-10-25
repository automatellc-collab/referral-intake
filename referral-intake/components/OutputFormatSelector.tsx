"use client";

import { useState } from "react";
import { ClipboardText, FileText, List } from "@phosphor-icons/react/dist/ssr";
import type { FormattedOutput } from "@/lib/template-orchestrator";

interface OutputFormatSelectorProps {
  formattedOutput: FormattedOutput;
  onFormatChange?: (format: "narrative" | "structured" | "checklist") => void;
}

export function OutputFormatSelector({
  formattedOutput,
  onFormatChange,
}: OutputFormatSelectorProps) {
  const [selectedFormat, setSelectedFormat] = useState<"narrative" | "structured" | "checklist">(
    "narrative"
  );

  const handleFormatChange = (format: "narrative" | "structured" | "checklist") => {
    setSelectedFormat(format);
    onFormatChange?.(format);
  };

  const formatOptions = [
    {
      id: "narrative",
      label: "Narrative",
      icon: <FileText weight="bold" size={16} />,
    },
    {
      id: "structured",
      label: "Structured",
      icon: <ClipboardText weight="bold" size={16} />,
    },
    {
      id: "checklist",
      label: "Checklist",
      icon: <List weight="bold" size={16} />,
    },
  ] as const;

  return (
    <div className="format-selector">
      <div className="format-buttons">
        {formatOptions.map((option) => (
          <button
            key={option.id}
            className={`format-button ${selectedFormat === option.id ? "active" : ""}`}
            onClick={() => handleFormatChange(option.id)}
            type="button"
            title={`View as ${option.label}`}
          >
            <span className="icon">{option.icon}</span>
            <span className="label">{option.label}</span>
          </button>
        ))}
      </div>

      <div className="format-content">
        {selectedFormat === "narrative" && (
          <div className="format-body narrative">
            {formattedOutput.narrative ? (
              <pre className="narrative-text">{formattedOutput.narrative}</pre>
            ) : (
              <p className="empty">No narrative available</p>
            )}
          </div>
        )}

        {selectedFormat === "structured" && (
          <div className="format-body structured">
            <pre className="json-text">{JSON.stringify(formattedOutput.structured, null, 2)}</pre>
          </div>
        )}

        {selectedFormat === "checklist" && (
          <div className="format-body checklist">
            {formattedOutput.checklist.sections.length > 0 ? (
              <div className="checklist-sections">
                {formattedOutput.checklist.sections.map((section, idx) => (
                  <div key={idx} className="checklist-section">
                    <h3 className="section-title">{section.title}</h3>
                    <div className="section-items">
                      {section.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="checklist-item">
                          <input
                            type="checkbox"
                            checked={item.checked ?? false}
                            readOnly
                            disabled
                          />
                          <label className="item-label">{item.label}</label>
                          {item.value && <span className="item-value">{item.value}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">No checklist items available</p>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .format-selector {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .format-buttons {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--border-soft);
          padding-bottom: 8px;
        }

        .format-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border: none;
          background: transparent;
          color: var(--ink-soft);
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .format-button:hover {
          background: var(--bg-soft);
          color: var(--ink);
        }

        .format-button.active {
          background: var(--accent-soft);
          color: var(--accent-strong);
          border-bottom: 2px solid var(--accent-strong);
        }

        .format-button .icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .format-content {
          padding: 12px 0;
        }

        .format-body {
          min-height: 200px;
        }

        .narrative-text,
        .json-text {
          font-family: "Courier New", monospace;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: var(--ink);
          padding: 12px;
          background: var(--bg-soft);
          border-radius: 4px;
          max-height: 600px;
          overflow-y: auto;
          margin: 0;
        }

        .empty {
          text-align: center;
          color: var(--ink-faint);
          padding: 24px;
          font-style: italic;
        }

        .checklist-sections {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .checklist-section {
          padding: 12px;
          background: var(--bg-soft);
          border-radius: 4px;
        }

        .section-title {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
        }

        .section-items {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .checklist-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 8px;
          border-radius: 4px;
          transition: background 0.2s ease;
        }

        .checklist-item:hover {
          background: var(--bg);
        }

        .checklist-item input[type="checkbox"] {
          margin-top: 2px;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .item-label {
          flex: 1;
          font-size: 13px;
          color: var(--ink);
          margin: 0;
          cursor: default;
        }

        .item-value {
          font-size: 12px;
          color: var(--ink-soft);
          padding: 2px 6px;
          background: var(--bg);
          border-radius: 3px;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
