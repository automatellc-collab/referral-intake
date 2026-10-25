"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { Template } from "@/lib/services/template-service";

interface CreateResponse {
  success: boolean;
  data?: Template;
  error?: string;
}

const SPECIALTIES = [
  "Allergy & Immunology",
  "Anesthesiology",
  "Cardiology",
  "Dermatology",
  "Emergency Medicine",
  "Endocrinology",
  "Gastroenterology",
  "General Surgery",
  "Hematology",
  "Infectious Disease",
  "Nephrology",
  "Neurology",
  "Oncology",
  "Ophthalmology",
  "Orthopedic Surgery",
  "Otolaryngology",
  "Pathology",
  "Pediatrics",
  "Psychiatry",
  "Pulmonology",
  "Radiology",
  "Rheumatology",
  "Urology",
];

export default function NewTemplatePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [description, setDescription] = useState("");
  const [preset, setPreset] = useState<"default" | "copy" | "blank">("default");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Template name is required");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          specialty: specialty || null,
          description: description.trim() || null,
        }),
      });

      const data: CreateResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create template");
      }

      if (data.data?.id) {
        router.push(`/templates/${data.data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="brand-mark">📋</span>
          <div className="brand-text">
            <span className="eyebrow">Template Management</span>
            <h1>Create Template</h1>
          </div>
        </div>
        <p className="top-note">
          Create a new custom output template for your referral summaries.
        </p>
      </header>

      <div className="wrap">
        <Link href="/templates" className="back-button">
          <ArrowLeft weight="bold" size={16} />
          Back to Templates
        </Link>

        <div className="create-form-container">
          <form onSubmit={handleSubmit} className="create-form">
            <div className="form-section">
              <h2>Template Details</h2>

              <div className="form-group">
                <label htmlFor="name">Template Name *</label>
                <input
                  id="name"
                  type="text"
                  placeholder="e.g., Cardiology Referral Summary"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                  className="text-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="specialty">Specialty (optional)</label>
                <select
                  id="specialty"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  disabled={isLoading}
                  className="specialty-select"
                >
                  <option value="">Select a specialty...</option>
                  {SPECIALTIES.map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="description">Description (optional)</label>
                <textarea
                  id="description"
                  placeholder="Describe what this template is for..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isLoading}
                  className="textarea-input"
                  rows={4}
                />
              </div>
            </div>

            <div className="form-section">
              <h2>Starting Point</h2>
              <p className="section-hint">Choose how to initialize this template</p>

              <div className="preset-options">
                <label className="preset-option">
                  <input
                    type="radio"
                    value="default"
                    checked={preset === "default"}
                    onChange={(e) => setPreset(e.target.value as typeof preset)}
                    disabled={isLoading}
                  />
                  <div className="preset-content">
                    <span className="preset-title">Start from Default</span>
                    <span className="preset-desc">
                      Use the default field configuration with standard field order and visibility
                    </span>
                  </div>
                </label>

                <label className="preset-option">
                  <input
                    type="radio"
                    value="blank"
                    checked={preset === "blank"}
                    onChange={(e) => setPreset(e.target.value as typeof preset)}
                    disabled={isLoading}
                  />
                  <div className="preset-content">
                    <span className="preset-title">Start Blank</span>
                    <span className="preset-desc">
                      Create an empty template and customize from scratch
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {error && (
              <div className="section-block review">
                <h3>Error</h3>
                <p style={{ margin: 0 }}>{error}</p>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" disabled={isLoading} className="primary">
                {isLoading ? "Creating..." : "Create Template"}
              </button>
              <Link href="/templates" className="secondary-button">
                Cancel
              </Link>
            </div>
          </form>
        </div>
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

        .create-form-container {
          max-width: 600px;
        }

        .create-form {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .form-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-section h2 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: var(--text-primary);
          font-family: var(--font-serif);
        }

        .section-hint {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .text-input,
        .textarea-input {
          width: 100%;
          background: var(--bg-primary);
          border: 1.5px solid var(--border-color);
          border-radius: 10px;
          padding: 13px 16px;
          font-family: var(--font-system);
          font-size: 14px;
          color: var(--text-primary);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }

        .text-input:focus-visible,
        .textarea-input:focus-visible {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 4px rgba(0, 82, 204, 0.1), 0 4px 12px rgba(0, 82, 204, 0.1);
        }

        .textarea-input {
          resize: vertical;
          font-size: 13px;
        }

        .preset-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .preset-option {
          display: flex;
          gap: 16px;
          padding: 16px;
          background: var(--bg-primary);
          border: 1.5px solid var(--border-light);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .preset-option:hover {
          border-color: var(--primary);
          background: var(--primary-light);
        }

        .preset-option input[type="radio"] {
          margin-top: 4px;
          cursor: pointer;
          accent-color: var(--primary);
        }

        .preset-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .preset-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .preset-desc {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        button.primary {
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
          position: relative;
          overflow: hidden;
        }

        button.primary:hover:not(:disabled) {
          box-shadow: var(--shadow-xl), 0 0 30px rgba(0, 82, 204, 0.3);
          transform: translateY(-3px);
          background: linear-gradient(135deg, #0052cc 0%, #002d7a 100%);
        }

        button.primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .secondary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-family: var(--font-system);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.3px;
          color: var(--text-primary);
          background: var(--bg-secondary);
          border: 1.5px solid var(--border-color);
          border-radius: 10px;
          padding: 13px 28px;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .secondary-button:hover {
          background: var(--bg-tertiary);
          border-color: var(--border-color);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
      `}</style>
    </>
  );
}
