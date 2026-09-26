import type { CatalogCode } from "@/shared/types/domain";

/** ICD-10 diagnoses and ACHI procedures that can be added to a topic. */
export const CATALOG: CatalogCode[] = [
  { system: "ICD-10", code: "I21.4", label: "Acute subendocardial MI (NSTEMI)", terms: "infarct miocardic инфаркт" },
  { system: "ICD-10", code: "I25.1", label: "Atherosclerotic heart disease", terms: "cardiopatie ateroscleroza" },
  { system: "ICD-10", code: "N18.3", label: "Chronic kidney disease, stage 3", terms: "boala cronica rinichi почечная" },
  { system: "ICD-10", code: "N14.1", label: "Nephropathy induced by other drugs", terms: "nefropatie contrast" },
  { system: "ICD-10", code: "I10", label: "Essential hypertension", terms: "hipertensiune гипертензия" },
  { system: "ICD-10", code: "E11.9", label: "Type 2 diabetes mellitus", terms: "diabet диабет" },
  { system: "ICD-10", code: "I48.9", label: "Atrial fibrillation, unspecified", terms: "fibrilatie фибрилляция" },
  { system: "ACHI", code: "38218-00", label: "Coronary angiography", terms: "coronarografie коронарография" },
  { system: "ACHI", code: "38306-00", label: "Percutaneous insertion of coronary stent", terms: "stent PCI" },
  { system: "ACHI", code: "55113-00", label: "Ultrasound of heart (echocardiography)", terms: "ecocardiografie эхо" },
];
