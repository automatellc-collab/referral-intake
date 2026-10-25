"use client";

import { useState, useRef } from "react";
import { UploadSimple, X } from "@phosphor-icons/react/dist/ssr";

interface SampleUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (text: string, attachmentUrls?: string[]) => void;
  isLoading?: boolean;
}

export function SampleUploadModal({
  isOpen,
  onClose,
  onSave,
  isLoading = false,
}: SampleUploadModalProps) {
  const [text, setText] = useState("");
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [attachmentInput, setAttachmentInput] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError(null);

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setFileError("File size must be less than 5MB");
      return;
    }

    // Check file type
    const validTypes = [
      "text/plain",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!validTypes.includes(file.type)) {
      setFileError("Only TXT, PDF, and Word documents are supported");
      return;
    }

    try {
      const content = await file.text();
      setText(content);
    } catch (error) {
      setFileError("Failed to read file");
    }
  };

  const handleAddAttachmentUrl = () => {
    if (attachmentInput.trim()) {
      setAttachmentUrls([...attachmentUrls, attachmentInput.trim()]);
      setAttachmentInput("");
    }
  };

  const handleRemoveAttachmentUrl = (index: number) => {
    setAttachmentUrls(attachmentUrls.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!text.trim()) {
      setFileError("Please provide some referral text");
      return;
    }

    onSave(text, attachmentUrls.length > 0 ? attachmentUrls : undefined);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upload Sample Referral</h2>
          <button
            className="close-button"
            onClick={onClose}
            type="button"
            aria-label="Close modal"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        <div className="modal-body">
          <div className="input-section">
            <h3 className="section-title">Option 1: Upload File</h3>
            <div className="file-upload-area">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.doc,.docx"
                onChange={handleFileUpload}
                hidden
              />
              <button
                className="upload-button"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <UploadSimple size={24} weight="bold" />
                <span>Click to upload or drag and drop</span>
                <span className="upload-hint">TXT, PDF, or Word (max 5MB)</span>
              </button>
            </div>
          </div>

          <div className="divider">
            <span className="divider-text">or</span>
          </div>

          <div className="input-section">
            <h3 className="section-title">Option 2: Paste Referral Text</h3>
            <textarea
              className="referral-textarea"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileError(null);
              }}
              placeholder="Paste the referral text here..."
              rows={8}
            />
          </div>

          {text && (
            <div className="text-preview">
              <h3 className="section-title">Preview ({text.length} characters)</h3>
              <div className="preview-box">
                {text.substring(0, 200)}
                {text.length > 200 ? "..." : ""}
              </div>
            </div>
          )}

          <div className="attachments-section">
            <h3 className="section-title">Attachments (Optional)</h3>
            <div className="attachment-input-group">
              <input
                type="url"
                className="attachment-url-input"
                value={attachmentInput}
                onChange={(e) => setAttachmentInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleAddAttachmentUrl();
                  }
                }}
                placeholder="https://example.com/attachment.pdf"
              />
              <button
                className="add-attachment-button"
                onClick={handleAddAttachmentUrl}
                type="button"
              >
                Add URL
              </button>
            </div>

            {attachmentUrls.length > 0 && (
              <div className="attachment-list">
                {attachmentUrls.map((url, index) => (
                  <div key={index} className="attachment-item">
                    <span className="attachment-url">{url}</span>
                    <button
                      className="remove-attachment"
                      onClick={() => handleRemoveAttachmentUrl(index)}
                      type="button"
                      aria-label="Remove attachment"
                    >
                      <X size={16} weight="bold" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {fileError && (
            <div className="error-message">
              <span>{fileError}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="cancel-button"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="submit-button"
            onClick={handleSubmit}
            disabled={isLoading || !text.trim()}
            type="button"
          >
            {isLoading ? "Processing..." : "Use Sample"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .modal-content {
          background: var(--bg-primary);
          border: 1px solid var(--border-light);
          border-radius: 14px;
          box-shadow: var(--shadow-xl);
          display: flex;
          flex-direction: column;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 24px;
          border-bottom: 1px solid var(--border-light);
          background: linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
        }

        .modal-title {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
          font-family: var(--font-serif);
        }

        .close-button {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s ease;
        }

        .close-button:hover {
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .modal-body {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 24px;
          overflow-y: auto;
        }

        .input-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .section-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
          font-family: var(--font-serif);
        }

        .file-upload-area {
          position: relative;
          border: 2px dashed var(--border-color);
          border-radius: 10px;
          overflow: hidden;
          transition: all 0.2s ease;
        }

        .file-upload-area:hover {
          border-color: var(--primary);
          background: var(--primary-light);
        }

        .upload-button {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          background: transparent;
          border: none;
          padding: 40px 20px;
          cursor: pointer;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 600;
          transition: color 0.2s ease;
        }

        .file-upload-area:hover .upload-button {
          color: var(--primary);
        }

        .upload-hint {
          font-size: 12px;
          color: var(--text-tertiary);
          font-weight: 500;
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text-tertiary);
          font-size: 12px;
        }

        .divider::before,
        .divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--border-light);
        }

        .divider-text {
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.05em;
        }

        .referral-textarea {
          width: 100%;
          background: var(--bg-secondary);
          border: 1.5px solid var(--border-color);
          border-radius: 8px;
          padding: 12px 14px;
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--text-primary);
          resize: vertical;
          transition: all 0.2s ease;
        }

        .referral-textarea:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.1);
          background: var(--bg-primary);
        }

        .text-preview {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .preview-box {
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          padding: 12px;
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.6;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .attachments-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .attachment-input-group {
          display: flex;
          gap: 8px;
        }

        .attachment-url-input {
          flex: 1;
          background: var(--bg-secondary);
          border: 1.5px solid var(--border-color);
          border-radius: 8px;
          padding: 10px 12px;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-primary);
          transition: all 0.2s ease;
        }

        .attachment-url-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.1);
          background: var(--bg-primary);
        }

        .add-attachment-button {
          padding: 10px 16px;
          background: linear-gradient(135deg, var(--primary), #003d82);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .add-attachment-button:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-2px);
        }

        .attachment-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .attachment-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-light);
          border-radius: 6px;
        }

        .attachment-url {
          flex: 1;
          font-size: 12px;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: var(--font-mono);
        }

        .remove-attachment {
          flex: 0 0 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-tertiary);
          transition: color 0.2s ease;
        }

        .remove-attachment:hover {
          color: var(--critical);
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          background: linear-gradient(135deg, #fee2e2, #fecaca);
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #991b1b;
          font-size: 13px;
        }

        .modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid var(--border-light);
          background: var(--bg-secondary);
        }

        .cancel-button {
          padding: 10px 20px;
          background: transparent;
          border: 1.5px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cancel-button:hover {
          border-color: var(--border-light);
          background: var(--bg-primary);
        }

        .submit-button {
          padding: 10px 20px;
          background: linear-gradient(135deg, var(--primary), #003d82);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .submit-button:hover:not(:disabled) {
          box-shadow: var(--shadow-lg);
          transform: translateY(-2px);
        }

        .submit-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
