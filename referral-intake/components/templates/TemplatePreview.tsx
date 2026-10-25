"use client";

import { useMemo } from "react";
import { ClipboardText, FileText, List, Warning } from "@phosphor-icons/react/dist/ssr";
import { templateOrchestrator } from "@/lib/template-orchestrator";
import type { NoteSummary } from "@/lib/schema";
import type { TemplateConfig } from "@/lib/services/template-service";
import type { FormattedOutput } from "@/lib/template-orchestrator";

interface TemplatePreviewProps {
  extraction: NoteSummary;
  config: TemplateConfig;
  outputFormat: "narrative" | "structured" | "checklist";
  onFormatChange?: (format: "narrative" | "structured" | "checklist") => void;
}

const FORMAT_OPTIONS = [
  {
    id: "narrative",
    label: "Narrative",
    icon: <FileText weight="bold" size={16} />,
    description: "Prose format",
  },
  {
    id: "structured",
    label: "Structured",
    icon: <ClipboardText weight="bold" size={16} />,
    description: "JSON format",
  },
  {
    id: "checklist",
    label: "Checklist",
    icon: <List weight="bold" size={16} />,
    description: "Checklist format",
  },
] as const;

export function TemplatePreview({
  extraction,
  config,
  outputFormat,
  onFormatChange,
}: TemplatePreviewProps) {
  // Apply template and generate formatted output
  const formattedOutput = useMemo((): FormattedOutput => {
    try {
      return templateOrchestrator.formatOutput(extraction, config, outputFormat);
    } catch (error) {
      console.error("Failed to format output:", error);
      return {
        narrative: "Error formatting output",
        structured: extraction,
        checklist: { sections: [] },
      };
    }
  }, [extraction, config, outputFormat]);

  const renderNarrative = () => {
    if (!formattedOutput.narrative) {
      return <p className="empty-message">No narrative available</p>;
    }
    return <pre className="narrative-content">{formattedOutput.narrative}</pre>;
  };

  const renderStructured = () => {
    if (!formattedOutput.structured) {
      return <p className="empty-message">No structured data available</p>;
    }
    return (
      <pre className="json-content">
        {JSON.stringify(formattedOutput.structured, null, 2)}
      </pre>
    );
  };

  const renderChecklist = () => {
    const { sections } = formattedOutput.checklist;

    if (!sections || sections.length === 0) {
      return <p className="empty-message">No checklist items available</p>;
    }

    return (
      <div className="checklist-content">
        {sections.map((section, sectionIdx) => (
          <div key={sectionIdx} className="checklist-section">
            <h4 className="section-title">{section.title}</h4>
            <div className="section-items">
              {section.items.map((item, itemIdx) => (
                <div key={itemIdx} className="checklist-item">
                  <input
                    type="checkbox"
                    checked={item.checked ?? false}
                    readOnly
                    disabled
                    className="item-checkbox"
                  />
                  <span className="item-label">{item.label}</span>
                  {item.value && (
                    <span className="item-value">{item.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="template-preview">
      <div className="preview-header">
        <h3 className="preview-title">Template Preview</h3>
        <div className="format-selector">
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={`format-option ${
                outputFormat === option.id ? "active" : ""
              }`}
              onClick={() => onFormatChange?.(option.id)}
              type="button"
              title={option.description}
            >
              <span className="format-icon">{option.icon}</span>
              <span className="format-label">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="preview-content">
        {outputFormat === "narrative" && renderNarrative()}
        {outputFormat === "structured" && renderStructured()}
        {outputFormat === "checklist" && renderChecklist()}
      </div>

      <style jsx>{`
        .template-preview {
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          overflow: hidden;
        }

        .preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px;
          background: linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
          border-bottom: 1px solid var(--border-light);
        }

        .preview-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
          font-family: var(--font-serif);
        }

        .format-selector {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .format-option {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border: 1px solid var(--border-light);
          background: var(--bg-primary);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .format-option:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border-color: var(--border-color);
        }

        .format-option.active {
          background: linear-gradient(135deg, var(--primary), #003d82);
          color: white;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.15);
        }

        .format-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .preview-content {
          padding: 16px;
          min-height: 300px;
          max-height: 600px;
          overflow-y: auto;
        }

        .empty-message {
          text-align: center;
          color: var(--text-tertiary);
          padding: 40px 20px;
          font-size: 14px;
          margin: 0;
        }

        .narrative-content,
        .json-content {
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: var(--text-primary);
          background: var(--bg-secondary);
          padding: 12px;
          border-radius: 8px;
          border: 1px solid var(--border-light);
          margin: 0;
          overflow-x: auto;
        }

        .checklist-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .checklist-section {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border: 1px solid var(--border-light);
        }

        .section-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .section-items {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .checklist-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 8px;
          border-radius: 6px;
          transition: background 0.2s ease;
        }

        .checklist-item:hover {
          background: var(--bg-tertiary);
        }

        .item-checkbox {
          flex: 0 0 18px;
          margin-top: 3px;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .item-label {
          flex: 1;
          font-size: 13px;
          color: var(--text-primary);
          line-height: 1.5;
        }

        .item-value {
          flex: 0 0 auto;
          font-size: 11px;
          color: var(--text-secondary);
          background: var(--bg-primary);
          padding: 4px 8px;
          border-radius: 4px;
          font-family: var(--font-mono);
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
