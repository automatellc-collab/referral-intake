import { z } from "zod";

export const EncounterNoteSchema = z.object({
  summary: z.string().describe("A one-paragraph summary of what was discussed and done during the encounter, based only on the transcript."),
  vitalsMentioned: z
    .array(z.string())
    .describe("Any vital signs spoken aloud during the encounter (e.g. 'BP 128/82'), verbatim or close to it. Empty if none were mentioned."),
  examFindings: z
    .array(
      z.object({
        system: z.string().describe("Body system or exam area, e.g. 'Cardiovascular', 'Abdomen'."),
        finding: z.string().describe("The finding as stated in the transcript."),
      }),
    )
    .describe("Physical exam findings the clinician spoke aloud during the encounter."),
  assessment: z.array(z.string()).describe("Diagnoses or clinical impressions stated during the encounter."),
  plan: z.array(z.string()).describe("Plan items stated: medications, orders, referrals, procedures, follow-up actions."),
  patientInstructions: z.array(z.string()).describe("Instructions or education given to the patient, if stated."),
  followUp: z.string().describe("Follow-up timing or plan, if stated. Empty string if not mentioned."),
  unclearSegments: z
    .array(z.string())
    .describe("Short excerpts of the transcript that are garbled, ambiguous, or likely mis-transcribed and need the clinician's review."),
});

export type EncounterNote = z.infer<typeof EncounterNoteSchema>;
