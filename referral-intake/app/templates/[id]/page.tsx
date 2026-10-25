"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Samples } from "@phosphor-icons/react/dist/ssr";
import type { Template, TemplateConfig } from "@/lib/services/template-service";

interface TemplateResponse {
  success: boolean;
  data?: Template;
  error?: string;
}

interface UpdateResponse {
  success: boolean;
  data?: Template;
  error?: string;
}

export default function TemplateEditorPage() {
  const params = useParams();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [config, setConfig] = useState<TemplateConfig>({
    fieldOrder: [],
    fieldVisibility: {},
    fieldRenames: {},
  });

  const [changelog, setChangelog] = useState("");
  const [showChangelog, setShowChangelog] = useState(false);

  useEffect(() => {
    loadTemplate();
  }, [templateId]);

  async function loadTemplate() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${templateId}`);
      const data: TemplateResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load template");
      }

      if (data.data) {
        setTemplate(data.data);
        setConfig(data.data.config);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load template");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    setSaveError(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          changelog: changelog.trim() || undefined,
        }),
      });

      const data: UpdateResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save template");
      }

      if (data.data) {
        setTemplate(data.data);
        setChangelog("");
        setShowChangelog(false);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setIsSaving(false);
    }
  }

  function updateFieldOrder(fieldName: string, position: number) {
    const newOrder = config.fieldOrder.filter((f) => f !== fieldName);
    newOrder.splice(position, 0, fieldName);
    setConfig({ ...config, fieldOrder: newOrder });
  }

  function toggleFieldVisibility(fieldName: string) {
    const newVisibility = { ...config.fieldVisibility };
    newVisibility[fieldName] = !newVisibility[fieldName];
    setConfig({ ...config, fieldVisibility: newVisibility });
  }

  function updateFieldRename(fieldName: string, newName: string) {
    const newRenames = { ...config.fieldRenames };
    if (newName.trim()) {
      newRenames[fieldName] = newName.trim();
    } else {
      delete newRenames[fieldName];
    }
    setConfig({ ...config, fieldRenames: newRenames });
  }

  if (isLoading) {
    return (
      <>
        <header className="top">
          <div className="brand">
            <span className="brand-mark">📋</span>
            <h1>Loading...</h1>
          </div>
        </header>
        <div className="wrap">
          <div className="empty-state">
            <span style={{ fontSize: 48 }}>⏳</span>
            <p>Loading template...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !template) {
    return (
      <>
        <header className="top">
          <div className="brand">
            <span className="brand-mark">📋</span>
            <h1>Error</h1>
          </div>
        </header>
        <div className="wrap">
          <div className="section-block review">
            <h3>Error Loading Template</h3>
            <p style={{ margin: 0 }}>{error || "Template not found"}</p>
            <Link href="/templates" style={{ marginTop: 16 }} className="chip-btn">
              Back to Templates
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="brand-mark">📋</span>
          <div className="brand-text">
            <span className="eyebrow">Template Editor</span>
            <h1>{template.name}</h1>
          </div>
        </div>
        <p className="top-note">
          Customize field order, visibility, and naming. Changes are saved as new versions.
        </p>
      </header>

      <div className="wrap">
        <div className="editor-top-bar">
          <Link href="/templates" className="back-button">
            <ArrowLeft weight="bold" size={16} />
            Back
          </Link>

          <div className="editor-actions">
            <Link href={`/templates/${templateId}/versions`} className="secondary-icon-button">
              <Clock weight="bold" size={16} />
              Versions
            </Link>
            <Link href={`/templates/${templateId}/samples`} className="secondary-icon-button">
              <Samples weight="bold" size={16} />
              Samples
            </Link>
          </div>
        </div>

        <div className="editor-container">
          <div className="editor-main">
            <div className="editor-section">
              <h2>Field Configuration</h2>

              {config.fieldOrder.length === 0 ? (
                <div className="empty-fields">
                  <p>No fields configured yet. Add fields to customize your template.</p>
                </div>
              ) : (
                <div className="field-list">
                  {config.fieldOrder.map((fieldName, index) => (
                    <div key={fieldName} className="field-item">
                      <div className="field-controls">
                        <input
                          type="checkbox"
                          checked={config.fieldVisibility[fieldName] !== false}
                          onChange={() => toggleFieldVisibility(fieldName)}
                          title="Toggle field visibility"
                        />
                        <span className="field-position">#{index + 1}</span>
                      </div>

                      <div className="field-info">
                        <span className="field-name">{fieldName}</span>
                        <input
                          type="text"
                          placeholder={`Rename ${fieldName}...`}
                          value={config.fieldRenames[fieldName] || ""}
                          onChange={(e) => updateFieldRename(fieldName, e.target.value)}
                          className="field-rename"
                        />
                      </div>

                      <div className="field-actions">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => updateFieldOrder(fieldName, index - 1)}
                            className="field-button"
                            title="Move up"
                          >
                            ↑
                          </button>
                        )}
                        {index < config.fieldOrder.length - 1 && (
                          <button
                            type="button"
                            onClick={() => updateFieldOrder(fieldName, index + 1)}
                            className="field-button"
                            title="Move down"
                          >
                            ↓
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="editor-section">
              <h2>Template Info</h2>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Name</span>
                  <span className="info-value">{template.name}</span>
                </div>
                {template.specialty && (
                  <div className="info-item">
                    <span className="info-label">Specialty</span>
                    <span className="info-value">{template.specialty}</span>
                  </div>
                )}
                <div className="info-item">
                  <span className="info-label">Scope</span>
                  <span className="info-value">{template.scope}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Last Modified</span>
                  <span className="info-value">
                    {new Date(template.updatedAt).toLocaleDateString()} at{" "}
                    {new Date(template.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="editor-sidebar">
            <div className="sidebar-card">
              <h3>Save Changes</h3>
              {saveError && (
                <div className="error-box">
                  <p>{saveError}</p>
                </div>
              )}

              {showChangelog ? (
                <>
                  <textarea
                    placeholder="Describe what you changed..."
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    disabled={isSaving}
                    className="changelog-input"
                  />
                  <div className="button-group">
                    <button onClick={handleSave} disabled={isSaving} className="primary">
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setShowChangelog(false);
                        setChangelog("");
                      }}
                      disabled={isSaving}
                      className="secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setShowChangelog(true)}
                  disabled={isSaving}
                  className="primary"
                >
                  Save Changes
                </button>
              )}
            </div>

            <div className="sidebar-card">
              <h3>Version Info</h3>
              <div className="version-info">
                {template.currentVersionId && (
                  <p>
                    <strong>Current Version:</strong> #{template.config.fieldOrder.length || 1}
                  </p>
                )}
                <p>
                  <strong>Created By:</strong> {template.createdBy}
                </p>
                <p>
                  <strong>Created:</strong> {new Date(template.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .editor-top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 32px;
        }

        .back-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--primary);
          text-decoration: none;
          transition: all 0.3s ease;
        }

        .back-button:hover {
          transform: translateX(-4px);
        }

        .editor-actions {
          display: flex;
          gap: 12px;
        }

        .secondary-icon-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          background: var(--bg-secondary);
          border: 1.5px solid var(--border-color);
          border-radius: 10px;
          padding: 10px 16px;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.3s ease;
        }

        .secondary-icon-button:hover {
          background: var(--bg-tertiary);
          border-color: var(--primary);
          color: var(--primary);
        }

        .editor-container {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 32px;
          align-items: start;
        }

        .editor-main {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .editor-section {
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 14px;
          padding: 24px;
          box-shadow: var(--shadow-md);
        }

        .editor-section h2 {
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 20px;
          color: var(--text-primary);
          font-family: var(--font-serif);
        }

        .empty-fields {
          padding: 40px 20px;
          text-align: center;
          color: var(--text-tertiary);
          background: var(--bg-secondary);
          border-radius: 10px;
        }

        .field-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .field-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-light);
          transition: all 0.3s ease;
        }

        .field-item:hover {
          background: var(--bg-tertiary);
          border-color: var(--border-color);
        }

        .field-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .field-controls input[type="checkbox"] {
          width: 20px;
          height: 20px;
          cursor: pointer;
          accent-color: var(--primary);
        }

        .field-position {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
          min-width: 32px;
        }

        .field-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .field-rename {
          width: 100%;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .field-rename:focus-visible {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(0, 82, 204, 0.1);
        }

        .field-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .field-button {
          width: 32px;
          height: 32px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          color: var(--text-secondary);
          transition: all 0.3s ease;
        }

        .field-button:hover {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px;
          background: var(--bg-secondary);
          border-radius: 8px;
        }

        .info-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-secondary);
          letter-spacing: 0.05em;
        }

        .info-value {
          font-size: 14px;
          color: var(--text-primary);
          font-weight: 500;
        }

        .editor-sidebar {
          display: flex;
          flex-direction: column;
          gap: 16px;
          position: sticky;
          top: 20px;
        }

        .sidebar-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 14px;
          padding: 20px;
          box-shadow: var(--shadow-md);
        }

        .sidebar-card h3 {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 16px;
          color: var(--text-primary);
          font-family: var(--font-serif);
        }

        .error-box {
          background: #fee2e2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
        }

        .error-box p {
          font-size: 13px;
          color: #991b1b;
          margin: 0;
        }

        .changelog-input {
          width: 100%;
          background: var(--bg-primary);
          border: 1.5px solid var(--border-color);
          border-radius: 8px;
          padding: 10px 12px;
          font-family: var(--font-system);
          font-size: 12px;
          color: var(--text-primary);
          resize: vertical;
          min-height: 80px;
          margin-bottom: 12px;
        }

        .changelog-input:focus-visible {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(0, 82, 204, 0.1);
        }

        .button-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        button.primary,
        button.secondary {
          padding: 10px 16px;
          border-radius: 8px;
          border: none;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        button.primary {
          color: white;
          background: linear-gradient(135deg, var(--primary) 0%, #003d82 100%);
          box-shadow: 0 4px 12px rgba(0, 82, 204, 0.15);
        }

        button.primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 82, 204, 0.2);
        }

        button.primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        button.secondary {
          color: var(--text-primary);
          background: var(--bg-secondary);
          border: 1.5px solid var(--border-color);
        }

        button.secondary:hover:not(:disabled) {
          background: var(--bg-tertiary);
          border-color: var(--border-color);
        }

        button.secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .version-info {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .version-info p {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 0;
        }

        .version-info strong {
          color: var(--text-primary);
        }

        @media (max-width: 1000px) {
          .editor-container {
            grid-template-columns: 1fr;
          }

          .editor-sidebar {
            position: static;
          }

          .info-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
