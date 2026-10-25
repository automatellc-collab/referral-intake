"use client";

import { useState, useMemo } from "react";
import {
  MagnifyingGlass,
  Copy,
  Pencil,
  Trash,
  Check,
  Lock,
} from "@phosphor-icons/react/dist/ssr";
import type { Template } from "@/lib/services/template-service";

interface TemplateListProps {
  templates: Template[];
  onUse?: (template: Template) => void;
  onEdit?: (template: Template) => void;
  onDuplicate?: (template: Template) => void;
  onDelete?: (templateId: string) => void;
  isLoading?: boolean;
}

export function TemplateList({
  templates,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
  isLoading = false,
}: TemplateListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "personal" | "team" | "organization">("all");

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesSearch =
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.specialty?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter = filter === "all" || template.scope === filter;

      return matchesSearch && matchesFilter;
    });
  }, [templates, searchQuery, filter]);

  const scopeLabel: Record<string, string> = {
    personal: "Personal",
    team: "Team",
    organization: "Organization",
    public: "Public",
  };

  const getScopeColor = (scope: string) => {
    switch (scope) {
      case "personal":
        return "personal";
      case "team":
        return "team";
      case "organization":
        return "organization";
      case "public":
        return "public";
      default:
        return "personal";
    }
  };

  if (templates.length === 0) {
    return (
      <div className="template-list empty-state">
        <div className="empty-icon">📋</div>
        <h3 className="empty-title">No Templates Yet</h3>
        <p className="empty-text">Create your first template to get started</p>
      </div>
    );
  }

  return (
    <div className="template-list">
      <div className="list-controls">
        <div className="search-box">
          <MagnifyingGlass size={16} weight="bold" className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-buttons">
          {(["all", "personal", "team", "organization"] as const).map((scope) => (
            <button
              key={scope}
              className={`filter-button ${filter === scope ? "active" : ""}`}
              onClick={() => setFilter(scope)}
              type="button"
            >
              {scope.charAt(0).toUpperCase() + scope.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="no-results">
          <p>No templates match your search</p>
        </div>
      ) : (
        <div className="templates-grid">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className={`template-card ${template.isActive ? "" : "inactive"}`}
            >
              <div className="card-header">
                <div className="card-title-section">
                  <h3 className="card-title">{template.name}</h3>
                  {template.specialty && (
                    <span className="card-specialty">{template.specialty}</span>
                  )}
                </div>
                <div className={`scope-badge ${getScopeColor(template.scope)}`}>
                  {template.scope === "organization" && (
                    <Lock size={12} weight="bold" />
                  )}
                  {scopeLabel[template.scope]}
                </div>
              </div>

              {template.description && (
                <p className="card-description">{template.description}</p>
              )}

              <div className="card-meta">
                <span className="meta-item">
                  <span className="meta-label">Default Format:</span>
                  <span className="meta-value">{template.defaultOutputFormat}</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">Last Modified:</span>
                  <span className="meta-value">
                    {new Date(template.updatedAt).toLocaleDateString()}
                  </span>
                </span>
              </div>

              <div className="card-actions">
                <button
                  className="action-button primary"
                  onClick={() => onUse?.(template)}
                  disabled={isLoading || !template.isActive}
                  type="button"
                  title="Use this template"
                >
                  <Check size={14} weight="bold" />
                  Use
                </button>

                {onEdit && (
                  <button
                    className="action-button"
                    onClick={() => onEdit(template)}
                    disabled={isLoading}
                    type="button"
                    title="Edit template"
                  >
                    <Pencil size={14} weight="bold" />
                  </button>
                )}

                {onDuplicate && (
                  <button
                    className="action-button"
                    onClick={() => onDuplicate(template)}
                    disabled={isLoading}
                    type="button"
                    title="Duplicate template"
                  >
                    <Copy size={14} weight="bold" />
                  </button>
                )}

                {onDelete && (
                  <button
                    className="action-button danger"
                    onClick={() => {
                      if (window.confirm(`Delete "${template.name}"?`)) {
                        onDelete(template.id);
                      }
                    }}
                    disabled={isLoading}
                    type="button"
                    title="Delete template"
                  >
                    <Trash size={14} weight="bold" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .template-list {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .template-list.empty-state {
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }

        .empty-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 8px;
          font-family: var(--font-serif);
        }

        .empty-text {
          font-size: 14px;
          color: var(--text-secondary);
          margin: 0;
        }

        .list-controls {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .search-box {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          color: var(--text-secondary);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          background: var(--bg-primary);
          border: 1.5px solid var(--border-color);
          border-radius: 10px;
          padding: 11px 12px 11px 36px;
          font-family: var(--font-system);
          font-size: 14px;
          color: var(--text-primary);
          transition: all 0.2s ease;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.1);
        }

        .search-input::placeholder {
          color: var(--text-tertiary);
        }

        .filter-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .filter-button {
          padding: 8px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .filter-button:hover {
          border-color: var(--border-color);
          color: var(--text-primary);
        }

        .filter-button.active {
          background: linear-gradient(135deg, var(--primary), #003d82);
          color: white;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.15);
        }

        .no-results {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-tertiary);
          font-size: 14px;
        }

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .template-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          padding: 16px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .template-card.inactive {
          opacity: 0.6;
          pointer-events: none;
        }

        .template-card:hover {
          border-color: var(--primary);
          box-shadow: var(--shadow-lg);
          transform: translateY(-4px);
        }

        .card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .card-title-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          min-width: 0;
        }

        .card-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: var(--font-serif);
        }

        .card-specialty {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }

        .scope-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 6px 10px;
          border-radius: 6px;
          flex-shrink: 0;
        }

        .scope-badge.personal {
          background: linear-gradient(135deg, #dbeafe, #bfdbfe);
          color: var(--primary);
          border: 1px solid #93c5fd;
        }

        .scope-badge.team {
          background: linear-gradient(135deg, #ddd6fe, #c4b5fd);
          color: #6d28d9;
          border: 1px solid #c4b5fd;
        }

        .scope-badge.organization {
          background: linear-gradient(135deg, #dcfce7, #bbf7d0);
          color: #166534;
          border: 1px solid #86efac;
        }

        .scope-badge.public {
          background: linear-gradient(135deg, #fef3c7, #fde68a);
          color: #92400e;
          border: 1px solid #fcd34d;
        }

        .card-description {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-meta {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
        }

        .meta-item {
          display: flex;
          gap: 6px;
          color: var(--text-secondary);
        }

        .meta-label {
          font-weight: 600;
          color: var(--text-secondary);
        }

        .meta-value {
          color: var(--text-primary);
        }

        .card-actions {
          display: flex;
          gap: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--border-light);
        }

        .action-button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-button:hover:not(:disabled) {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border-color: var(--border-color);
        }

        .action-button.primary {
          flex: 1.5;
          background: linear-gradient(135deg, var(--primary), #003d82);
          color: white;
          border-color: var(--primary);
        }

        .action-button.primary:hover:not(:disabled) {
          box-shadow: var(--shadow-md);
          transform: translateY(-2px);
        }

        .action-button.danger:hover:not(:disabled) {
          background: var(--critical);
          color: white;
          border-color: var(--critical);
        }

        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
