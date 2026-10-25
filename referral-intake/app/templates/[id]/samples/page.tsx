"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import type { ExtractionSample } from "@/lib/services/sample-service";

interface SamplesResponse {
  success: boolean;
  data?: ExtractionSample[];
  error?: string;
}

interface DeleteResponse {
  success: boolean;
  error?: string;
}

export default function TemplateSamplesPage() {
  const params = useParams();
  const templateId = params.id as string;

  const [samples, setSamples] = useState<ExtractionSample[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadSamples();
  }, [templateId]);

  async function loadSamples() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${templateId}/samples`);
      const data: SamplesResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load samples");
      }

      setSamples(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load samples");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(sampleId: string) {
    if (!window.confirm("Are you sure you want to delete this sample? This action cannot be undone.")) {
      return;
    }

    setDeletingId(sampleId);
    try {
      const response = await fetch(`/api/templates/${templateId}/samples/${sampleId}`, {
        method: "DELETE",
      });

      const data: DeleteResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete sample");
      }

      setSamples((prev) => prev.filter((s) => s.id !== sampleId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete sample");
    } finally {
      setDeletingId(null);
    }
  }

  function getTestStatus(sample: ExtractionSample) {
    if (!sample.testResult) {
      return { icon: "⚪", label: "Not tested", className: "neutral" };
    }
    if (sample.testResult.success) {
      return { icon: "🟢", label: "Pass", className: "ok" };
    }
    return { icon: "🔴", label: "Fail", className: "critical" };
  }

  function getMatchScore(sample: ExtractionSample) {
    if (!sample.testResult) {
      return "—";
    }
    return `${(sample.testResult.matchScore * 100).toFixed(0)}%`;
  }

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="brand-mark">📋</span>
          <div className="brand-text">
            <span className="eyebrow">Template Samples</span>
            <h1>Test Samples</h1>
          </div>
        </div>
        <p className="top-note">
          Manage test samples for this template. Run tests to verify template accuracy with real data.
        </p>
      </header>

      <div className="wrap">
        <div className="samples-header">
          <Link href={`/templates/${templateId}`} className="back-button">
            <ArrowLeft weight="bold" size={16} />
            Back to Template
          </Link>
          <button className="add-sample-button">
            <Plus weight="bold" size={16} />
            Add Sample
          </button>
        </div>

        {isLoading && (
          <div className="empty-state">
            <span style={{ fontSize: 48 }}>⏳</span>
            <p>Loading samples...</p>
          </div>
        )}

        {error && (
          <div className="section-block review">
            <h3>Error</h3>
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        )}

        {!isLoading && !error && samples.length === 0 && (
          <div className="empty-state">
            <span style={{ fontSize: 48 }}>📭</span>
            <p>No samples yet. Add a sample to test your template.</p>
          </div>
        )}

        {!isLoading && !error && samples.length > 0 && (
          <div className="samples-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Test Status</th>
                  <th>Match Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((sample) => {
                  const status = getTestStatus(sample);
                  return (
                    <tr key={sample.id}>
                      <td className="name-cell">
                        <div className="sample-name">{sample.name}</div>
                        <div className="sample-text">
                          {sample.referralText.substring(0, 60)}
                          {sample.referralText.length > 60 ? "..." : ""}
                        </div>
                      </td>
                      <td className="date-cell">
                        {new Date(sample.createdAt).toLocaleDateString()}
                      </td>
                      <td className="status-cell">
                        <span className={`status-badge ${status.className}`}>
                          {status.icon} {status.label}
                        </span>
                      </td>
                      <td className="score-cell">{getMatchScore(sample)}</td>
                      <td className="actions-cell">
                        <button
                          onClick={() => handleDelete(sample.id)}
                          disabled={deletingId === sample.id}
                          className="delete-button"
                          title="Delete sample"
                        >
                          <Trash weight="bold" size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .samples-header {
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

        .add-sample-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, var(--primary) 0%, #003d82 100%);
          border: none;
          border-radius: 8px;
          padding: 10px 16px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0, 82, 204, 0.15);
        }

        .add-sample-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 82, 204, 0.2);
        }

        .samples-table {
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 14px;
          box-shadow: var(--shadow-md);
          overflow: hidden;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        thead {
          background: linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
          border-bottom: 1px solid var(--border-light);
        }

        th {
          padding: 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-secondary);
          letter-spacing: 0.05em;
        }

        td {
          padding: 16px;
          border-bottom: 1px solid var(--border-light);
          font-size: 14px;
          color: var(--text-primary);
        }

        tbody tr:last-child td {
          border-bottom: none;
        }

        tbody tr {
          transition: background-color 0.3s ease;
        }

        tbody tr:hover {
          background-color: var(--bg-secondary);
        }

        .name-cell {
          max-width: 400px;
        }

        .sample-name {
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .sample-text {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .date-cell {
          font-size: 13px;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .status-cell {
          text-align: center;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 6px 12px;
          border-radius: 6px;
          letter-spacing: 0.05em;
        }

        .status-badge.ok {
          background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
          color: #166534;
          border: 1px solid #86efac;
        }

        .status-badge.critical {
          background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
          color: #991b1b;
          border: 1px solid #fca5a5;
        }

        .status-badge.neutral {
          background: linear-gradient(135deg, var(--bg-tertiary) 0%, #e2e8f0 100%);
          color: var(--text-secondary);
          border: 1px solid var(--border-light);
        }

        .score-cell {
          text-align: center;
          font-weight: 600;
          color: var(--primary);
        }

        .actions-cell {
          text-align: right;
        }

        .delete-button {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-secondary);
          border: 1.5px solid var(--border-light);
          border-radius: 8px;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.3s ease;
        }

        .delete-button:hover:not(:disabled) {
          background: #fee2e2;
          border-color: #fecaca;
          color: #991b1b;
        }

        .delete-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 800px) {
          .samples-table {
            overflow-x: auto;
          }

          table {
            min-width: 600px;
          }

          th,
          td {
            padding: 12px;
            font-size: 12px;
          }

          .name-cell {
            max-width: 200px;
          }

          .sample-text {
            font-size: 11px;
          }
        }
      `}</style>
    </>
  );
}
