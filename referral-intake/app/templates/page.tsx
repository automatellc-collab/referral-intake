"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import type { Template } from "@/lib/services/template-service";

interface TemplateResponse {
  success: boolean;
  data?: Template[];
  error?: string;
}

const SPECIALTIES = [
  "Cardiology",
  "Dermatology",
  "Endocrinology",
  "Gastroenterology",
  "Neurology",
  "Orthopedics",
  "Rheumatology",
];

const SCOPES = ["personal", "team", "organization", "public"];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("");
  const [selectedScope, setSelectedScope] = useState<string>("");

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    filterTemplates();
  }, [templates, searchQuery, selectedSpecialty, selectedScope]);

  async function loadTemplates() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/templates");
      const data: TemplateResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load templates");
      }

      setTemplates(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setIsLoading(false);
    }
  }

  function filterTemplates() {
    let filtered = templates;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          (t.description?.toLowerCase().includes(query) ?? false)
      );
    }

    if (selectedSpecialty) {
      filtered = filtered.filter((t) => t.specialty === selectedSpecialty);
    }

    if (selectedScope) {
      filtered = filtered.filter((t) => t.scope === selectedScope);
    }

    setFilteredTemplates(filtered);
  }

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="brand-mark">📋</span>
          <div className="brand-text">
            <span className="eyebrow">Template Management</span>
            <h1>Templates</h1>
          </div>
        </div>
        <p className="top-note">
          Create and manage custom output templates for your referral summaries. Customize field order,
          visibility, and output formatting.
        </p>
      </header>

      <div className="wrap">
        <div style={{ marginBottom: 32 }}>
          <Link href="/templates/new" className="primary-button">
            <Plus weight="bold" size={16} />
            Create Template
          </Link>
        </div>

        <div className="templates-filters">
          <div className="filter-group">
            <label htmlFor="search">Search</label>
            <div className="search-input-wrapper">
              <MagnifyingGlass weight="bold" size={16} className="search-icon" />
              <input
                id="search"
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="specialty">Specialty</label>
            <select
              id="specialty"
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="specialty-select"
            >
              <option value="">All Specialties</option>
              {SPECIALTIES.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="scope">Scope</label>
            <select
              id="scope"
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="specialty-select"
            >
              <option value="">All Scopes</option>
              {SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {scope.charAt(0).toUpperCase() + scope.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading && (
          <div className="empty-state">
            <span style={{ fontSize: 48 }}>⏳</span>
            <p>Loading templates...</p>
          </div>
        )}

        {error && (
          <div className="section-block review">
            <h3>Error</h3>
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        )}

        {!isLoading && !error && filteredTemplates.length === 0 && (
          <div className="empty-state">
            <span style={{ fontSize: 48 }}>📭</span>
            <p>No templates found</p>
            {templates.length === 0 && (
              <Link href="/templates/new" className="primary-button">
                Create your first template
              </Link>
            )}
          </div>
        )}

        {!isLoading && !error && filteredTemplates.length > 0 && (
          <div className="templates-grid">
            {filteredTemplates.map((template) => (
              <Link key={template.id} href={`/templates/${template.id}`} className="template-card">
                <div className="template-card-header">
                  <h3>{template.name}</h3>
                  <span className={`pill ${template.scope}`}>
                    {template.scope}
                  </span>
                </div>

                {template.description && (
                  <p className="template-description">{template.description}</p>
                )}

                <div className="template-meta">
                  {template.specialty && (
                    <span className="meta-item">
                      <span className="meta-label">Specialty:</span>
                      {template.specialty}
                    </span>
                  )}
                  <span className="meta-item">
                    <span className="meta-label">Updated:</span>
                    {new Date(template.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .primary-button {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-system);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.3px;
          color: white;
          background: linear-gradient(135deg, var(--primary) 0%, #003d82 100%);
          border: none;
          border-radius: 10px;
          padding: 13px 28px;
          cursor: pointer;
          box-shadow: var(--shadow-lg), 0 0 20px rgba(0, 82, 204, 0.2);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          text-decoration: none;
        }

        .primary-button:hover {
          box-shadow: var(--shadow-xl), 0 0 30px rgba(0, 82, 204, 0.3);
          transform: translateY(-3px);
          background: linear-gradient(135deg, #0052cc 0%, #002d7a 100%);
        }

        .templates-filters {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 20px;
          margin-bottom: 40px;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .filter-group label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }

        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          color: var(--text-tertiary);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          background: var(--bg-primary);
          border: 1.5px solid var(--border-color);
          border-radius: 10px;
          padding: 13px 16px 13px 40px;
          font-family: var(--font-system);
          font-size: 14px;
          color: var(--text-primary);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }

        .search-input:focus-visible {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(0, 82, 204, 0.1), 0 4px 12px rgba(0, 82, 204, 0.1);
        }

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }

        .template-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 14px;
          box-shadow: var(--shadow-md);
          overflow: hidden;
          padding: 24px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          text-decoration: none;
          color: inherit;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .template-card:hover {
          box-shadow: var(--shadow-lg);
          transform: translateY(-4px);
          border-color: var(--accent);
        }

        .template-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .template-card-header h3 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: var(--text-primary);
          font-family: var(--font-serif);
        }

        .template-card .pill {
          flex-shrink: 0;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 6px 12px;
          border-radius: 6px;
        }

        .template-card .pill.personal {
          background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
          color: #0052cc;
          border: 1px solid #93c5fd;
        }

        .template-card .pill.team {
          background: linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 100%);
          color: #6366f1;
          border: 1px solid #a78bfa;
        }

        .template-card .pill.organization {
          background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
          color: #166534;
          border: 1px solid #86efac;
        }

        .template-card .pill.public {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          color: #92400e;
          border: 1px solid #fcd34d;
        }

        .template-description {
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-secondary);
          margin: 0;
        }

        .template-meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .meta-item {
          display: flex;
          gap: 8px;
        }

        .meta-label {
          font-weight: 600;
          color: var(--text-tertiary);
        }

        @media (max-width: 1000px) {
          .templates-filters {
            grid-template-columns: 1fr 1fr;
          }

          .templates-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          }
        }

        @media (max-width: 640px) {
          .templates-filters {
            grid-template-columns: 1fr;
          }

          .templates-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
