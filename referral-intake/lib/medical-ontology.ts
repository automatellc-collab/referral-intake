import "server-only";

// Lightweight medical term databases (can be extended with APIs later)
// These cover the most common terms per specialty

const ICD10_CODES: Record<string, string> = {
  // Cardiology
  "I10": "Essential (primary) hypertension",
  "I11": "Hypertensive heart disease",
  "I50": "Heart failure",
  "I63": "Cerebral infarction",
  "I64": "Stroke, not specified as hemorrhage or infarction",
  "I65": "Occlusion and stenosis of cerebral artery",
  "I70": "Atherosclerosis",
  "I21": "Myocardial infarction",
  "I24": "Certain current complications of myocardial infarction",
  "I25": "Chronic ischemic heart disease",
  "I36": "Acute rheumatic fever with pericarditis",
  "I37": "Acute rheumatic mitral valve disease",
  "I38": "Endocarditis",
  "I39": "Endocarditis and heart valve disorders",
  "I40": "Acute myocarditis",
  "I42": "Cardiomyopathy",
  "I48": "Atrial fibrillation and flutter",
  "I49": "Other cardiac arrhythmias",
  "I51": "Complications and ill-defined descriptions of heart disease",

  // General
  "E11": "Type 2 diabetes mellitus",
  "E10": "Type 1 diabetes mellitus",
  "E78": "Abdominal obesity and associated lipid disorders",
  "F32": "Major depressive disorder",
  "F41": "Anxiety disorders",
  "J44": "Chronic obstructive pulmonary disease",
  "K21": "Gastro-esophageal reflux disease",
  "M79": "Other and unspecified soft tissue disorders",
  "M10": "Gout",
  "M15": "Primary osteoarthritis",
  "M17": "Bilateral primary osteoarthritis of knee",
  "N18": "Chronic kidney disease",
  "R07": "Chest pain",
  "R06": "Abnormalities of breathing",
  "R01": "Abnormal heart sounds and cardiac murmurs",
};

const COMMON_MEDICATIONS: Record<string, { dosing: string; class: string }> = {
  lisinopril: { dosing: "10-40mg daily", class: "ACE inhibitor" },
  atorvastatin: { dosing: "10-80mg daily", class: "Statin" },
  metoprolol: { dosing: "25-200mg daily", class: "Beta blocker" },
  amlodipine: { dosing: "2.5-10mg daily", class: "Calcium channel blocker" },
  levothyroxine: { dosing: "25-200mcg daily", class: "Thyroid hormone" },
  aspirin: { dosing: "81-325mg daily", class: "Antiplatelet" },
  metformin: { dosing: "500-2550mg daily", class: "Antidiabetic" },
  omeprazole: { dosing: "20-40mg daily", class: "Proton pump inhibitor" },
  sertraline: { dosing: "50-200mg daily", class: "SSRI antidepressant" },
  warfarin: { dosing: "2-10mg daily", class: "Anticoagulant" },
};

const DRUG_INTERACTIONS: Record<string, string[]> = {
  warfarin: ["aspirin", "ibuprofen", "atorvastatin"],
  metformin: ["contrast dye"],
  lisinopril: ["potassium", "NSAIDs"],
  metoprolol: ["verapamil", "diltiazem"],
};

const ALLERGY_REACTIONS: Record<string, string[]> = {
  penicillin: ["rash", "anaphylaxis", "angioedema", "Stevens-Johnson"],
  sulfa: ["rash", "anaphylaxis"],
  cephalosporin: ["rash", "anaphylaxis"],
  NSAIDs: ["GI bleeding", "ulcer", "anaphylaxis"],
  ACE_inhibitors: ["cough", "hyperkalemia", "angioedema"],
};

const LAB_TESTS: Record<string, { normal_range: string; unit: string }> = {
  troponin: { normal_range: "<0.04", unit: "ng/mL" },
  "pro-BNP": { normal_range: "<100", unit: "pg/mL" },
  creatinine: { normal_range: "0.7-1.3", unit: "mg/dL" },
  TSH: { normal_range: "0.4-4.0", unit: "mIU/L" },
  hemoglobin: { normal_range: "12-16", unit: "g/dL" },
  INR: { normal_range: "0.8-1.1 (or 2-3 on warfarin)", unit: "ratio" },
};

const CRITICAL_VALUES = {
  troponin: 0.04,
  creatinine: 3.0,
  hemoglobin: 7.0,
  "pro-BNP": 900,
  potassium: 6.0,
  glucose: 400,
};

export function validateICD10Code(code: string): { valid: boolean; description?: string } {
  const cleanCode = code.trim().toUpperCase();
  if (ICD10_CODES[cleanCode]) {
    return { valid: true, description: ICD10_CODES[cleanCode] };
  }
  return { valid: false };
}

export function validateMedication(drugName: string): {
  valid: boolean;
  dosing?: string;
  class?: string;
} {
  const cleanName = drugName.toLowerCase().trim();
  if (COMMON_MEDICATIONS[cleanName]) {
    return { valid: true, ...COMMON_MEDICATIONS[cleanName] };
  }
  return { valid: false };
}

export function checkDrugInteractions(
  medications: string[],
): { interaction: string; severity: string }[] {
  const interactions: { interaction: string; severity: string }[] = [];

  for (const drug of medications) {
    const cleanDrug = drug.toLowerCase().trim();
    if (DRUG_INTERACTIONS[cleanDrug]) {
      for (const interactant of DRUG_INTERACTIONS[cleanDrug]) {
        if (medications.some((m) => m.toLowerCase().includes(interactant))) {
          interactions.push({
            interaction: `${cleanDrug} + ${interactant}`,
            severity: "HIGH",
          });
        }
      }
    }
  }

  return interactions;
}

export function checkAllergyRisks(
  allergyName: string,
  prescribedDrugs: string[],
): { risk: string; severity: string }[] {
  const risks: { risk: string; severity: string }[] = [];
  const allergyKey = allergyName.toLowerCase().replace(/-/g, "_");

  if (ALLERGY_REACTIONS[allergyKey]) {
    for (const drug of prescribedDrugs) {
      const cleanDrug = drug.toLowerCase().trim();
      // Check if drug class might trigger allergy
      if (
        (allergyKey.includes("penicillin") && cleanDrug.includes("cephalosporin")) ||
        (allergyKey.includes("nsaid") && cleanDrug.includes("ibuprofen"))
      ) {
        risks.push({
          risk: `${allergyName} allergy + ${drug} prescribed`,
          severity: "CRITICAL",
        });
      }
    }
  }

  return risks;
}

export function flagCriticalValue(
  testName: string,
  value: number,
): { isCritical: boolean; normalRange?: string } {
  const cleanTest = testName.toLowerCase().trim();
  const critical = CRITICAL_VALUES[cleanTest as keyof typeof CRITICAL_VALUES];

  if (critical && Math.abs(value) > critical) {
    return {
      isCritical: true,
      normalRange: LAB_TESTS[cleanTest]?.normal_range,
    };
  }

  return { isCritical: false, normalRange: LAB_TESTS[cleanTest]?.normal_range };
}

export function normalizeTerms(term: string): {
  normalized: string;
  confidence: number;
} {
  const cleanTerm = term.toLowerCase().trim();

  // Common abbreviations and aliases
  const aliases: Record<string, string> = {
    chf: "Congestive heart failure",
    mi: "Myocardial infarction",
    cad: "Coronary artery disease",
    "copd-x": "Chronic obstructive pulmonary disease",
    dm2: "Type 2 diabetes mellitus",
    htn: "Hypertension",
    hld: "Hyperlipidemia",
    ckd: "Chronic kidney disease",
    afib: "Atrial fibrillation",
    gerd: "Gastroesophageal reflux disease",
    "b/p": "Blood pressure",
    "o2 sat": "Oxygen saturation",
  };

  if (aliases[cleanTerm]) {
    return { normalized: aliases[cleanTerm], confidence: 0.9 };
  }

  return { normalized: term, confidence: 0.5 };
}
