"use client";

import { useState } from "react";
import { FileText, ClipboardText, List } from "@phosphor-icons/react/dist/ssr";

interface OutputFormatSelectorProps {
  value: "narrative" | "structured" | "checklist";
  onChange: (format: "narrative" | "structured" | "checklist") => void;
  showLabel?: boolean;
}

const FORMAT_OPTIONS = [
  {
    id: "narrative",
    label: "Narrative",
    icon: <FileText weight="bold" size={16} />,
    description: "Prose format suitable for clinical notes",
  },
  {
    id: "structured",
    label: "Structured",
    icon: <ClipboardText weight="bold" size={16} />,
    description: "JSON structure for data integration",
  },
  {
    id: "checklist",
    label: "Checklist",
    icon: <List weight="bold" size={16} />,
    description: "Checklist format for verification",
  },
] as const;

export function OutputFormatSelector({
  value,
  onChange,
  showLabel = true,
}: OutputFormatSelectorProps) {
  return (
    <div className="output-format-selector">
      {showLabel && <label className="selector-label">Output Format</label>}
      <div className="format-buttons">
        {FORMAT_OPTIONS.map((option) => (
          <button
            key={option.id}
            className={`format-button ${value === option.id ? "active" : ""}`}
            onClick={() => onChange(option.id)}
            type="button"
            title={option.description}
          >
            <span className="button-icon">{option.icon}</span>
            <span className="button-label">{option.label}</span>
          </button>
        ))}
      </div>

      <style jsx>{`
        .output-format-selector {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .selector-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }

        .format-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .format-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          border: 1.5px solid var(--border-color);
          background: var(--bg-primary);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .format-button:hover:not(.active) {
          border-color: var(--border-light);
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .format-button.active {
          background: linear-gradient(135deg, var(--primary), #003d82);
          color: white;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.15), var(--shadow-md);
        }

        .button-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
