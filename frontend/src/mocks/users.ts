import type { DirectoryUser } from "@/shared/types/domain";

export const USERS: DirectoryUser[] = [
  { name: "Ion Bivol", email: "ion.bivol@medpark.md", dept: "IT & Securitate", cabinets: ["admin", "moderator"], twoFa: "on" },
  { name: "Dr. Elena Rusu", email: "elena.rusu@medpark.md", dept: "Cardiologie", cabinets: ["moderator", "participant"], twoFa: "on" },
  { name: "Victor Ciobanu", email: "victor.ciobanu@medpark.md", dept: "Direcția medicală", cabinets: ["moderator"], twoFa: "on" },
  { name: "Dr. Andrei Cebotari", email: "andrei.cebotari@medpark.md", dept: "Chirurgie CV", cabinets: ["participant"], twoFa: "on" },
  { name: "Dr. Natalia Popescu", email: "natalia.popescu@medpark.md", dept: "ATI", cabinets: ["participant"], twoFa: "on" },
  { name: "Dr. Igor Munteanu", email: "igor.munteanu@medpark.md", dept: "Imagistică", cabinets: ["participant"], twoFa: "setup" },
  { name: "Olga Sîrbu", email: "olga.sirbu@medpark.md", dept: "Farmacie clinică", cabinets: ["participant"], twoFa: "on" },
];
