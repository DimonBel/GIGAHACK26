import { beforeEach, describe, expect, it } from "vitest";

import { TOPICS } from "@/mocks/topics";

import { applySuggestion, parseSuggestion, searchCatalog, selectedTopic, useMinutesStore } from "./minutes";

const initial = useMinutesStore.getState();
const minutes = () => useMinutesStore.getState();
const first = TOPICS[0]!;

describe("minutes", () => {
  beforeEach(() => useMinutesStore.setState(initial, true));

  it("searches the catalog by code, label and RO/RU terms, without codes already present", () => {
    expect(searchCatalog("", first)).toEqual([]);
    expect(searchCatalog("rinichi", first).map((c) => c.code)).toEqual(["N18.3"]);
    expect(searchCatalog("I21", first)).toEqual([]); // already on the topic
    expect(searchCatalog("i", undefined).length).toBeLessThanOrEqual(5);
  });

  it("turns an accepted suggestion into the right kind of item", () => {
    const base = { ...first, suggestions: [] };
    const view = parseSuggestion("Olga Sîrbu", "Point of view", "Agree");
    expect(applySuggestion({ ...base, suggestions: [view] }, view).views.at(-1)).toMatchObject({ name: "Olga Sîrbu", text: "Agree" });
    const attention = parseSuggestion("Olga Sîrbu", "Attention point", "Check allergy");
    expect(applySuggestion(base, attention).attention.at(-1)?.text).toBe("Check allergy");
    const task = parseSuggestion("Olga Sîrbu", "Task", "Call lab");
    expect(applySuggestion(base, task).actions.at(-1)).toMatchObject({ text: "Call lab", owner: "Olga Sîrbu" });
    const diagnosis = parseSuggestion("Olga Sîrbu", "Diagnosis", "e11.9 Type 2 diabetes");
    expect(diagnosis.code).toEqual({ system: "ICD-10", code: "E11.9", label: "Type 2 diabetes" });
    expect(applySuggestion(base, diagnosis).codes.at(-1)?.code).toBe("E11.9");
  });

  it("accepting removes the suggestion from the inbox", () => {
    const suggestion = first.suggestions[0]!;
    minutes().acceptSuggestion(first.id, suggestion.id);
    const topic = minutes().topics[0]!;
    expect(topic.suggestions).toEqual([]);
    expect(topic.codes.map((c) => c.code)).toContain("N18.3");
  });

  it("adds a topic in edit mode and selects it; deleting goes back to the first topic", () => {
    minutes().addTopic();
    const added = selectedTopic(minutes());
    expect(added?.title).toBe("");
    expect(minutes().editing).toBe(true);
    minutes().deleteTopic(added!.id);
    expect(minutes().section).toEqual({ kind: "topic", id: first.id });
    expect(minutes().editing).toBe(false);
  });

  it("a participant's suggestion lands on the open topic and is counted", () => {
    minutes().setSuggestionKind("Diagnosis");
    minutes().setSuggestionText("N18.3 Chronic kidney disease");
    minutes().submitSuggestion("Dr. Natalia Popescu");
    expect(minutes().topics[0]!.suggestions).toHaveLength(2);
    expect(minutes().suggestionsSent).toBe(1);
    expect(minutes().suggestionText).toBe("");
  });

  it("does not send an empty suggestion", () => {
    minutes().setSuggestionText("   ");
    minutes().submitSuggestion("x");
    expect(minutes().suggestionsSent).toBe(0);
  });

  it("toggles attendance by name", () => {
    minutes().toggleAbsent("Maria Lungu");
    expect(minutes().absent).toEqual(["Maria Lungu"]);
    minutes().toggleAbsent("Maria Lungu");
    expect(minutes().absent).toEqual([]);
  });
});
