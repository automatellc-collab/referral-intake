"use client";

import { useState, useCallback } from "react";
import { CaretDown, Eye, EyeSlash, Equals } from "@phosphor-icons/react/dist/ssr";
import type { TemplateConfig } from "@/lib/services/template-service";
import type { NoteSummary } from "@/lib/schema";

export type FormatHint = "prose" | "bullets" | "code" | "table";

interface FieldConfig {
  displayName: string;
  formatHint: FormatHint;
}

interface TemplateFieldManagerProps {
  config: TemplateConfig;
  onChange: (config: TemplateConfig) => void;
}

// All fields from NoteSummary schema
const AVAILABLE_FIELDS: Array<{
  id: keyof NoteSummary;
  label: string;
  description: string;
}> = [
  {
    id: "openingNarrative",
    label: "Opening Narrative",
    description: "Chief complaint and opening context paragraph",
  },
  {
    id: "urgency",
    label: "Urgency Level",
    description: "Routine, Urgent, or STAT classification",
  },
  {
    id: "resultsTimeline",
    label: "Results Timeline",
    description: "Dated lab and imaging results in chronological order",
  },
  {
    id: "reviewOfSystemsNotes",
    label: "Review of Systems",
    description: "Explicit symptom positives and negatives",
  },
  {
    id: "medicalHistory",
    label: "Medical History",
    description: "Relevant past medical history",
  },
  {
    id: "activeProblems",
    label: "Active Problems",
    description: "Current diagnoses with ICD codes",
  },
  {
    id: "surgicalHistory",
    label: "Surgical History",
    description: "Previous surgical procedures",
  },
  {
    id: "currentMedications",
    label: "Current Medications",
    description: "Active medication list",
  },
  {
    id: "allergies",
    label: "Allergies",
    description: "Drug and environmental allergies",
  },
  {
    id: "socialHistoryNotes",
    label: "Social History",
    description: "Smoking, occupation, and other social factors",
  },
  {
    id: "redFlags",
    label: "Red Flags",
    description: "Clinically significant findings requiring confirmation",
  },
  {
    id: "gaps",
    label: "Information Gaps",
    description: "Missing expected information for this specialty",
  },
];

const FORMAT_HINTS: FormatHint[] = ["prose", "bullets", "code", "table"];

export function TemplateFieldManager({
  config,
  onChange,
}: TemplateFieldManagerProps) {
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [draggedField, setDraggedField] = useState<string | null>(null);

  // Initialize field order from config or use default
  const fieldOrder =
    config.fieldOrder.length > 0
      ? config.fieldOrder
      : AVAILABLE_FIELDS.map((f) => f.id);

  // Get field config metadata
  const getFieldConfig = (fieldId: string): FieldConfig => {
    const displayName = config.fieldRenames?.[fieldId];
    const formatHint =
      (config.fieldPrompts?.[fieldId] as FormatHint) || "prose";

    return {
      displayName: displayName || AVAILABLE_FIELDS.find((f) => f.id === fieldId)?.label || fieldId,
      formatHint,
    };
  };

  // Toggle field visibility
  const handleToggleVisibility = useCallback(
    (fieldId: string) => {
      const currentVisibility = config.fieldVisibility[fieldId] ?? true;
      const newConfig: TemplateConfig = {
        ...config,
        fieldVisibility: {
          ...config.fieldVisibility,
          [fieldId]: !currentVisibility,
        },
      };
      onChange(newConfig);
    },
    [config, onChange]
  );

  // Update field display name
  const handleUpdateDisplayName = useCallback(
    (fieldId: string, displayName: string) => {
      const newConfig: TemplateConfig = {
        ...config,
        fieldRenames: {
          ...config.fieldRenames,
          [fieldId]: displayName,
        },
      };
      onChange(newConfig);
    },
    [config, onChange]
  );

  // Update field format hint
  const handleUpdateFormatHint = useCallback(
    (fieldId: string, hint: FormatHint) => {
      const newConfig: TemplateConfig = {
        ...config,
        fieldPrompts: {
          ...config.fieldPrompts,
          [fieldId]: hint,
        },
      };
      onChange(newConfig);
    },
    [config, onChange]
  );

  // Handle field reordering
  const handleDragStart = (fieldId: string) => {
    setDraggedField(fieldId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (targetFieldId: string) => {
    if (!draggedField || draggedField === targetFieldId) {
      setDraggedField(null);
      return;
    }

    const currentOrder = [...fieldOrder];
    const draggedIndex = currentOrder.indexOf(draggedField);
    const targetIndex = currentOrder.indexOf(targetFieldId);

    if (draggedIndex > -1 && targetIndex > -1) {
      currentOrder.splice(draggedIndex, 1);
      currentOrder.splice(targetIndex, 0, draggedField);

      const newConfig: TemplateConfig = {
        ...config,
        fieldOrder: currentOrder,
      };
      onChange(newConfig);
    }

    setDraggedField(null);
  };

  const isVisible = (fieldId: string) => config.fieldVisibility[fieldId] ?? true;
  const fieldDef = AVAILABLE_FIELDS.find((f) => f.id === fieldOrder[0]);

  return (
    <div className="field-manager">
      <div className="field-manager-header">
        <h3 className="title">Configure Fields</h3>
        <p className="subtitle">Drag to reorder, click to configure, toggle visibility</p>
      </div>

      <div className="fields-list">
        {fieldOrder.map((fieldId) => {
          const field = AVAILABLE_FIELDS.find((f) => f.id === fieldId);
          if (!field) return null;

          const fieldConfig = getFieldConfig(fieldId);
          const visible = isVisible(fieldId);

          return (
            <div
              key={fieldId}
              className={`field-item ${visible ? "visible" : "hidden"} ${
                expandedField === fieldId ? "expanded" : ""
              } ${draggedField === fieldId ? "dragging" : ""}`}
              draggable
              onDragStart={() => handleDragStart(fieldId)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(fieldId)}
            >
              <div className="field-header">
                <button
                  className="drag-handle"
                  aria-label="Drag to reorder"
                  type="button"
                >
                  <Equals size={16} weight="bold" />
                </button>

                <button
                  className="visibility-toggle"
                  onClick={() => handleToggleVisibility(fieldId)}
                  aria-label={visible ? "Hide field" : "Show field"}
                  type="button"
                  title={visible ? "Hide field" : "Show field"}
                >
                  {visible ? (
                    <Eye size={16} weight="bold" />
                  ) : (
                    <EyeSlash size={16} weight="bold" />
                  )}
                </button>

                <div className="field-info">
                  <div className="field-name">{field.label}</div>
                  <div className="field-description">{field.description}</div>
                </div>

                <button
                  className={`expand-button ${expandedField === fieldId ? "open" : ""}`}
                  onClick={() =>
                    setExpandedField(
                      expandedField === fieldId ? null : fieldId
                    )
                  }
                  aria-label="Toggle configuration"
                  type="button"
                >
                  <CaretDown size={16} weight="bold" />
                </button>
              </div>

              {expandedField === fieldId && (
                <div className="field-config">
                  <div className="config-group">
                    <label className="config-label">Display Name</label>
                    <input
                      type="text"
                      className="config-input"
                      value={fieldConfig.displayName}
                      onChange={(e) =>
                        handleUpdateDisplayName(fieldId, e.target.value)
                      }
                      placeholder={field.label}
                    />
                  </div>

                  <div className="config-group">
                    <label className="config-label">Format Hint</label>
                    <div className="format-chips">
                      {FORMAT_HINTS.map((hint) => (
                        <button
                          key={hint}
                          className={`chip ${
                            fieldConfig.formatHint === hint ? "active" : ""
                          }`}
                          onClick={() =>
                            handleUpdateFormatHint(fieldId, hint)
                          }
                          type="button"
                        >
                          {hint}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .field-manager {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .field-manager-header {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }

        .title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
          font-family: var(--font-serif);
        }

        .subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }

        .fields-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-item {
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 10px;
          transition: all 0.2s ease;
          overflow: hidden;
        }

        .field-item.visible {
          opacity: 1;
        }

        .field-item.hidden {
          opacity: 0.6;
        }

        .field-item.dragging {
          opacity: 0.5;
          background: var(--bg-tertiary);
        }

        .field-item.expanded {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.1);
        }

        .field-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          cursor: grab;
          user-select: none;
        }

        .field-item.dragging .field-header {
          cursor: grabbing;
        }

        .drag-handle {
          flex: 0 0 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          padding: 0;
          cursor: grab;
          color: var(--text-tertiary);
          transition: color 0.2s ease;
        }

        .field-header:hover .drag-handle {
          color: var(--text-secondary);
        }

        .visibility-toggle {
          flex: 0 0 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: var(--primary);
          transition: all 0.2s ease;
        }

        .visibility-toggle:hover {
          transform: scale(1.1);
        }

        .field-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .field-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .field-description {
          font-size: 12px;
          color: var(--text-tertiary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .expand-button {
          flex: 0 0 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s ease;
        }

        .expand-button.open {
          transform: rotate(180deg);
          color: var(--primary);
        }

        .field-config {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px 16px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-light);
        }

        .config-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .config-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }

        .config-input {
          width: 100%;
          background: var(--bg-primary);
          border: 1.5px solid var(--border-color);
          border-radius: 8px;
          padding: 10px 12px;
          font-family: var(--font-system);
          font-size: 13px;
          color: var(--text-primary);
          transition: all 0.2s ease;
        }

        .config-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.1);
        }

        .format-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--primary);
          background: linear-gradient(135deg, var(--primary-light), #dbeafe);
          border: 1.5px solid #bfdbfe;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .chip:hover {
          background: linear-gradient(135deg, var(--primary), #003d82);
          color: white;
          border-color: var(--primary);
          box-shadow: var(--shadow-md);
        }

        .chip.active {
          background: linear-gradient(135deg, var(--primary), #003d82);
          color: white;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.2);
        }
      `}</style>
    </div>
  );
}
