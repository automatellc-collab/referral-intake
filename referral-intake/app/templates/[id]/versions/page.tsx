"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { TemplateVersion } from "@/lib/services/template-service";

interface VersionsResponse {
  success: boolean;
  data?: TemplateVersion[];
  error?: string;
}

interface RestoreResponse {
  success: boolean;
  error?: string;
}

export default function TemplateVersionsPage() {
  const params = useParams();
  const templateId = params.id as string;

  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    loadVersions();
  }, [templateId]);

  async function loadVersions() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${templateId}/versions`);
      const data: VersionsResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load versions");
      }

      setVersions((data.data || []).sort((a, b) => b.version - a.version));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRestore(versionId: string) {
    if (!window.confirm("Restore this version? A new version will be created with its configuration.")) {
      return;
    }

    setRestoringId(versionId);
    try {
      const response = await fetch(`/api/templates/${templateId}/versions/${versionId}/restore`, {
        method: "POST",
      });

      const data: RestoreResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to restore version");
      }

      // Reload versions after successful restore
      await loadVersions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restore version");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="brand-mark">📋</span>
          <div className="brand-text">
            <span className="eyebrow">Template Versions</span>
            <h1>Version History</h1>
          </div>
        </div>
        <p className="top-note">
          View and restore previous versions of your template. Each save creates a new version.
        </p>
      </header>

      <div className="wrap">
        <Link href={`/templates/${templateId}`} className="back-button">
          <ArrowLeft weight="bold" size={16} />
          Back to Template
        </Link>

        {isLoading && (
          <div className="empty-state">
            <span style={{ fontSize: 48 }}>⏳</span>
            <p>Loading versions...</p>
          </div>
        )}

        {error && (
          <div className="section-block review">
            <h3>Error</h3>
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        )}

        {!isLoading && !error && versions.length === 0 && (
          <div className="empty-state">
            <span style={{ fontSize: 48 }}>📭</span>
            <p>No versions available yet</p>
          </div>
        )}

        {!isLoading && !error && versions.length > 0 && (
          <div className="versions-timeline">
            {versions.map((version, index) => (
              <div key={version.id} className="version-item">
                <div className="version-header">
                  <div className="version-title">
                    <span className="version-number">Version {version.version}</span>
                    {index === 0 && <span className="version-badge current">Current</span>}
                  </div>
                  <span className="version-date">
                    {new Date(version.createdAt).toLocaleDateString()} at{" "}
                    {new Date(version.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                {version.changelog && (
                  <div className="version-changelog">
                    <p className="changelog-title">Changes:</p>
                    <p className="changelog-text">{version.changelog}</p>
                  </div>
                )}

                <div className="version-meta">
                  <span className="meta-item">
                    <span className="meta-label">Created By:</span>
                    {version.createdBy}
                  </span>
                  <span className="meta-item">
                    <span className="meta-label">Fields:</span>
                    {version.config.fieldOrder.length}
                  </span>
                </div>

                <div className="version-actions">
                  <button
                    onClick={() => handleRestore(version.id)}
                    disabled={restoringId === version.id || index === 0}
                    className="restore-button"
                  >
                    {restoringId === version.id ? "Restoring..." : "Restore This Version"}
                  </button>
                </div>

                {index < versions.length - 1 && <div className="timeline-connector" />}
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .back-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--primary);
          text-decoration: none;
          margin-bottom: 32px;
          transition: all 0.3s ease;
        }

        .back-button:hover {
          transform: translateX(-4px);
        }

        .versions-timeline {
          position: relative;
          max-width: 800px;
        }

        .versions-timeline::before {
          content: "";
          position: absolute;
          left: 23px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: linear-gradient(to bottom, var(--primary), var(--accent));
        }

        .version-item {
          position: relative;
          margin-left: 60px;
          margin-bottom: 32px;
          padding: 20px;
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 12px;
          box-shadow: var(--shadow-md);
          transition: all 0.3s ease;
        }

        .version-item:hover {
          box-shadow: var(--shadow-lg);
          border-color: var(--primary);
        }

        .version-item::before {
          content: "";
          position: absolute;
          left: -44px;
          top: 24px;
          width: 16px;
          height: 16px;
          background: var(--primary);
          border: 3px solid var(--bg-primary);
          border-radius: 50%;
          box-shadow: 0 0 0 4px var(--primary-light);
          transition: all 0.3s ease;
        }

        .version-item:hover::before {
          width: 20px;
          height: 20px;
          left: -46px;
          top: 22px;
          box-shadow: 0 0 0 6px var(--primary-light);
        }

        .version-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 12px;
        }

        .version-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .version-number {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          font-family: var(--font-serif);
        }

        .version-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 4px;
          letter-spacing: 0.05em;
        }

        .version-badge.current {
          background: linear-gradient(135deg, var(--primary-light) 0%, #dbeafe 100%);
          color: var(--primary);
          border: 1px solid #93c5fd;
        }

        .version-date {
          font-size: 12px;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .version-changelog {
          margin-bottom: 16px;
          padding: 12px;
          background: var(--bg-secondary);
          border-left: 3px solid var(--accent);
          border-radius: 6px;
        }

        .changelog-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin: 0 0 6px;
          letter-spacing: 0.05em;
        }

        .changelog-text {
          font-size: 13px;
          color: var(--text-primary);
          margin: 0;
          line-height: 1.5;
        }

        .version-meta {
          display: flex;
          gap: 20px;
          padding: 12px 0;
          border-top: 1px solid var(--border-light);
          border-bottom: 1px solid var(--border-light);
          margin-bottom: 16px;
          font-size: 12px;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
          color: var(--text-secondary);
        }

        .meta-label {
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.05em;
          color: var(--text-tertiary);
        }

        .version-actions {
          display: flex;
          gap: 12px;
        }

        .restore-button {
          flex: 1;
          padding: 10px 16px;
          background: linear-gradient(135deg, var(--primary) 0%, #003d82 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0, 82, 204, 0.15);
        }

        .restore-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 82, 204, 0.2);
        }

        .restore-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .timeline-connector {
          position: absolute;
          left: -34px;
          top: calc(100% + 16px);
          width: 2px;
          height: 16px;
          background: linear-gradient(to bottom, var(--primary), var(--accent));
        }

        @media (max-width: 640px) {
          .versions-timeline::before {
            left: 7px;
          }

          .version-item {
            margin-left: 40px;
            padding: 16px;
          }

          .version-item::before {
            left: -28px;
            top: 20px;
          }

          .version-item:hover::before {
            left: -28px;
          }

          .version-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .version-date {
            white-space: normal;
          }

          .version-meta {
            flex-direction: column;
            gap: 12px;
          }
        }
      `}</style>
    </>
  );
}
