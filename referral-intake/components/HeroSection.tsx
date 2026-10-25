"use client";

export function HeroSection() {
  return (
    <section className="hero-section">
      {/* Animated background elements */}
      <div className="hero-bg-grid" />
      <div className="hero-gradient-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div className="hero-content">
        <div className="hero-text">
          <h1 className="hero-title">
            Clinical Intelligence<br />
            <span className="gradient-text">at the Speed of Thought</span>
          </h1>
          <p className="hero-subtitle">
            Transform raw referral packets into structured clinical summaries instantly.
            <br />
            Every extracted field is traceable. Every uncertainty is flagged.
          </p>

          <div className="hero-stats">
            <div className="stat-item">
              <div className="stat-number">76%</div>
              <div className="stat-label">Avg Confidence</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">7</div>
              <div className="stat-label">Pipeline Phases</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">40+</div>
              <div className="stat-label">Specialties</div>
            </div>
          </div>
        </div>

        {/* Animated extraction visualization */}
        <div className="hero-visualization">
          <div className="extraction-pipeline">
            {/* Input document */}
            <div className="pipeline-stage input-stage">
              <div className="stage-icon">📄</div>
              <div className="stage-label">Referral</div>
              <div className="stage-content">
                <div className="document-lines">
                  <div className="line short" />
                  <div className="line" />
                  <div className="line short" />
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="pipeline-arrow">
              <svg viewBox="0 0 60 4" preserveAspectRatio="none">
                <path d="M 0 2 L 50 2" strokeWidth="2" stroke="url(#arrowGradient)" fill="none" />
                <defs>
                  <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0052cc" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#0052cc" stopOpacity="1" />
                    <stop offset="100%" stopColor="#0052cc" stopOpacity="0.2" />
                  </linearGradient>
                </defs>
                <polygon points="50,2 45,0 45,4" fill="#0052cc" />
              </svg>
            </div>

            {/* Processing */}
            <div className="pipeline-stage processing-stage">
              <div className="stage-icon processing-icon">⚡</div>
              <div className="stage-label">Extract & Validate</div>
              <div className="stage-content processing-content">
                <div className="processor-ring" />
              </div>
            </div>

            {/* Arrow */}
            <div className="pipeline-arrow">
              <svg viewBox="0 0 60 4" preserveAspectRatio="none">
                <path d="M 0 2 L 50 2" strokeWidth="2" stroke="url(#arrowGradient2)" fill="none" />
                <defs>
                  <linearGradient id="arrowGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#10b981" stopOpacity="1" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
                  </linearGradient>
                </defs>
                <polygon points="50,2 45,0 45,4" fill="#10b981" />
              </svg>
            </div>

            {/* Output summary */}
            <div className="pipeline-stage output-stage">
              <div className="stage-icon">✓</div>
              <div className="stage-label">Structured Summary</div>
              <div className="stage-content">
                <div className="summary-fields">
                  <div className="field-tag">HPI</div>
                  <div className="field-tag">ROS</div>
                  <div className="field-tag">Meds</div>
                  <div className="field-tag">Allergies</div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating cards with features */}
          <div className="feature-cards">
            <div className="feature-card card-1">
              <div className="card-icon">🎯</div>
              <div className="card-title">Clinician Ready</div>
              <div className="card-desc">Structured for immediate chart entry</div>
            </div>
            <div className="feature-card card-2">
              <div className="card-icon">🔍</div>
              <div className="card-title">Full Traceability</div>
              <div className="card-desc">Every field linked to source</div>
            </div>
            <div className="feature-card card-3">
              <div className="card-icon">⚠️</div>
              <div className="card-title">Review Flags</div>
              <div className="card-desc">Uncertain items highlighted</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="scroll-indicator">
        <div className="scroll-dot" />
        <span>Scroll to start</span>
      </div>
    </section>
  );
}
