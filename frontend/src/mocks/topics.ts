import type { Topic } from "@/shared/types/domain";

/** Minutes of "Consiliu medical — Cardiologie", topic by topic. */
export const TOPICS: Topic[] = [
  {
    id: "t-1",
    title: "Caz clinic: pacient M., 64 ani, NSTEMI",
    tag: "Medical",
    time: "00:01–00:24",
    summary:
      "Pacient internat cu NSTEMI confirmat, troponină în creștere. Coronarografia arată stenoză de 80% pe LAD. Consiliul a decis PCI cu stent, cu protecție renală și dublă antiagregare.",
    views: [
      { id: "v-1", name: "Dr. Andrei Cebotari", text: "PCI fără amânare; leziunea LAD este semnificativă hemodinamic." },
      { id: "v-2", name: "Dr. Natalia Popescu", text: "Fără contraindicații anestezice; ClCr 48 ml/min, necesară hidratare." },
      { id: "v-3", name: "Dr. Igor Munteanu", text: "FEVS 45%, hipokinezie anterioară; control ecografic post-PCI." },
    ],
    actions: [
      { id: "a-1", text: "Efectuare PCI cu stent farmacologic pe LAD", owner: "Dr. Andrei Cebotari", due: "2026-09-28" },
      { id: "a-2", text: "Încărcare raport ecocardiografic în SIA", owner: "Dr. Igor Munteanu", due: "2026-09-25" },
      { id: "a-3", text: "Verificare interacțiuni DAPT (aspirină + ticagrelor)", owner: "Olga Sîrbu", due: "2026-09-26" },
    ],
    attention: [{ id: "x-1", text: "Confirmați alergia la iod înainte de procedură." }],
    codes: [
      { system: "ICD-10", code: "I21.4", label: "Acute subendocardial MI (NSTEMI)" },
      { system: "ICD-10", code: "I25.1", label: "Atherosclerotic heart disease" },
      { system: "ACHI", code: "38218-00", label: "Coronary angiography" },
      { system: "ACHI", code: "38306-00", label: "Percutaneous insertion of coronary stent" },
    ],
    drg: "F10A",
    drgLabel: "Interventional coronary procedures with AMI, major complexity",
    suggestions: [
      {
        id: "s-1",
        from: "Dr. Natalia Popescu",
        kind: "Diagnosis",
        text: "N18.3 — Chronic kidney disease, stage 3",
        code: { system: "ICD-10", code: "N18.3", label: "Chronic kidney disease, stage 3" },
      },
    ],
    transcript: [
      { who: "E. Rusu", ts: "00:02:14", langs: "RO·EN", text: "Deci, pacientul de 64 de ani, NSTEMI confirmat, troponina a crescut, și avem follow-up după angiografie." },
      { who: "A. Cebotari", ts: "00:03:05", langs: "RO·RU", text: "Coronarografia arată stenoză 80% pe LAD, честно говоря, я бы не откладывал, recomand PCI cu stent." },
      { who: "N. Popescu", ts: "00:04:41", langs: "RU·RO", text: "По анестезии рисков нет, dar clearance-ul la creatinină e 48, trebuie hidratare." },
      { who: "I. Munteanu", ts: "00:06:20", langs: "RO·EN", text: "Ecocardiografia: FEVS 45%, hipokinezie anterioară. I'll upload the report by Friday." },
    ],
  },
  {
    id: "t-2",
    title: "Protocol de protecție renală la contrast",
    tag: "Medical",
    time: "00:24–00:41",
    summary:
      "Se propune un protocol unic pentru pacienții cu ClCr sub 60 ml/min: hidratare IV 12 h pre- și post-procedură și limitarea volumului de contrast.",
    views: [
      { id: "v-4", name: "Dr. Natalia Popescu", text: "Protocolul trebuie să fie obligatoriu în ATI și cardiologie intervențională." },
      { id: "v-5", name: "Olga Sîrbu", text: "Sistăm AINS și metformin cu 48 h înainte de procedură." },
    ],
    actions: [
      { id: "a-4", text: "Redactare protocol, versiunea 1", owner: "Dr. Natalia Popescu", due: "2026-10-01" },
      { id: "a-5", text: "Listă de medicamente de sistat peri-procedural", owner: "Olga Sîrbu", due: "2026-09-30" },
    ],
    attention: [{ id: "x-2", text: "Necesită aprobarea Direcției medicale înainte de implementare." }],
    codes: [{ system: "ICD-10", code: "N14.1", label: "Nephropathy induced by other drugs" }],
    drg: "",
    drgLabel: "",
    suggestions: [],
    transcript: [
      { who: "N. Popescu", ts: "00:25:10", langs: "RO", text: "Propun un protocol unic pentru toți pacienții cu clearance sub 60." },
      { who: "O. Sîrbu", ts: "00:27:48", langs: "RO·RU", text: "Metforminul îl oprim, и НПВС тоже, cu 48 de ore înainte." },
    ],
  },
  {
    id: "t-3",
    title: "Grafic ture ATI, octombrie",
    tag: "Administrative",
    time: "00:41–00:58",
    summary:
      "Deficit de două asistente pe tura de noapte în săptămânile 2–3. Se redistribuie personal din blocul operator, cu ore suplimentare aprobate.",
    views: [
      { id: "v-6", name: "Maria Lungu", text: "Redistribuirea este posibilă doar cu acordul șefului de bloc operator." },
      { id: "v-7", name: "Victor Ciobanu", text: "Aprob ore suplimentare pentru două săptămâni." },
    ],
    actions: [{ id: "a-6", text: "Grafic final ture ATI, octombrie", owner: "Maria Lungu", due: "2026-09-29" }],
    attention: [],
    codes: [],
    drg: "",
    drgLabel: "",
    suggestions: [],
    transcript: [
      { who: "M. Lungu", ts: "00:42:03", langs: "RO·EN", text: "Avem gap pe night shift în săptămânile doi și trei." },
      { who: "V. Ciobanu", ts: "00:47:30", langs: "RO", text: "Aprob orele suplimentare, două săptămâni." },
    ],
  },
];
