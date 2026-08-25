import { Info, Warning } from "@phosphor-icons/react/dist/ssr";
import type { EncounterNote } from "@/lib/encounterSchema";
import { SkeletonSummary } from "./SkeletonSummary";

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <div className="field-value empty">Not mentioned in the transcript.</div>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 14, lineHeight: 1.6 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

interface EncounterNotePanelProps {
  note: EncounterNote | null;
  isLoading: boolean;
  error: string | null;
}

export function EncounterNotePanel({ note, isLoading, error }: EncounterNotePanelProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-head-title">
          <span className="icon">
            <Info weight="bold" size={18} />
          </span>
          <h2>Encounter note</h2>
        </div>
      </div>
      <div className="panel-body">
        {isLoading && <SkeletonSummary />}

        {!isLoading && error && <div className="empty-state status-text error">{error}</div>}

        {!isLoading && !error && !note && (
          <div className="empty-state">
            Record the encounter, then generate a note, to see a structured draft here.
          </div>
        )}

        {!isLoading && !error && note && (
          <>
            <div className="section-block review" style={{ marginTop: 0, marginBottom: 20 }}>
              <h3>
                <Info weight="bold" size={14} />
                Draft — review before it becomes part of the chart
              </h3>
              <div className="field-value" style={{ fontSize: 13.5 }}>
                Generated from a live speech-to-text transcript. Transcription is imperfect — verify every section
                against your own memory of the encounter before signing.
              </div>
            </div>

            <div className="field-row">
              <div className="field-label">Summary</div>
              <div className="field-value">{note.summary || "Not enough transcript to summarize."}</div>
            </div>

            <div className="field-row">
              <div className="field-label">Vitals mentioned</div>
              <div>
                <BulletList items={note.vitalsMentioned} />
              </div>
            </div>

            <div className="field-row">
              <div className="field-label">Exam findings</div>
              <div>
                {note.examFindings.length === 0 ? (
                  <div className="field-value empty">Not mentioned in the transcript.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {note.examFindings.map((finding, i) => (
                      <li key={i} style={{ fontSize: 14, lineHeight: 1.6 }}>
                        <strong>{finding.system}:</strong> {finding.finding}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="field-row">
              <div className="field-label">Assessment</div>
              <div>
                <BulletList items={note.assessment} />
              </div>
            </div>

            <div className="field-row">
              <div className="field-label">Plan</div>
              <div>
                <BulletList items={note.plan} />
              </div>
            </div>

            <div className="field-row">
              <div className="field-label">Patient instructions</div>
              <div>
                <BulletList items={note.patientInstructions} />
              </div>
            </div>

            <div className="field-row">
              <div className="field-label">Follow-up</div>
              <div className="field-value">
                {note.followUp || <span className="field-value empty">Not mentioned in the transcript.</span>}
              </div>
            </div>

            {note.unclearSegments.length > 0 && (
              <div className="section-block review">
                <h3>
                  <Warning weight="bold" size={14} />
                  Unclear in the transcript
                </h3>
                <ul>
                  {note.unclearSegments.map((segment, i) => (
                    <li key={i}>&ldquo;{segment}&rdquo;</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
