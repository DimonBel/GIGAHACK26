import { request } from "./client";

/** An ICD-10 code with its names in the three languages of the app. */
export interface IcdCode {
  code: string;
  ro: string;
  ru: string;
  en: string;
}

/** ICD-10 codes by code prefix ("I21") or words in Romanian, Russian or English. */
export const searchCodes = (q: string, limit = 8) =>
  request<IcdCode[]>("GET", `/codes?q=${encodeURIComponent(q)}&limit=${limit}`);
