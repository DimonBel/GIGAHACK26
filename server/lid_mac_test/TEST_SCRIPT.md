# Test script: ward handover in three languages (~3 minutes)

A mock morning handover in a cardiology ward. Fictional patients, no real data.

**Speakers** (2-4 people; one person may read several roles, but different voices are better):
- **A**: head of the ward (Romanian)
- **B**: resident doctor (Romanian, drops Russian words in: *короче*, *давай*)
- **C**: nurse (speaks Russian)
- **D**: visiting doctor (English)

**Recording tips**
- Normal meeting room, Mac or phone on the table 1-2 m away. Don't hold it close to the mouth.
- Speak at a normal pace, as in a real meeting; small mistakes and hesitations are fine, don't restart.
- Leave about 1 second between speakers. Don't read the line numbers or the `[RO]` labels.
- Numbers are written as words so everyone says them the same way.

**Labels**: `[RO]` Romanian, `[RU]` Russian, `[EN]` English, `[RO+ru]` Romanian with a few Russian words (the language
detector should call these Romanian; the Russian words are handled later in the pipeline).

---

1. `[RO]` **A:** Bună dimineața, colegi. Începem predarea de gardă. Cine raportează primul?

2. `[RO]` **B:** Eu. Pacientul din salonul trei, patul opt, bărbat de șaizeci și șapte de ani, internat aseară cu
   infarct miocardic acut.

3. `[RO]` **B:** S-a făcut coronarografie și s-a pus un stent pe artera descendentă anterioară. Acum este stabil,
   tensiunea o sută treizeci pe optzeci.

4. `[RU]` **C:** Ночью он жаловался на боль в груди. Я сделала ЭКГ и сразу позвонила дежурному врачу.

5. `[RO]` **A:** Bine. Și ce a arătat electrocardiograma?

6. `[RU]` **C:** Никаких новых изменений не было. Тропонин взяли утром, результат будет к десяти часам.

7. `[RO+ru]` **B:** Da, короче, repetăm troponina la prânz și, dacă totul e bine, давай îl mutăm în salonul obișnuit.

8. `[RO]` **A:** De acord. Următorul pacient, vă rog.

9. `[RO]` **B:** Pacienta din patul doisprezece, femeie de cincizeci și patru de ani, cu pneumonie. Febra a scăzut
   la treizeci și șapte și două.

10. `[EN]` **D:** Sorry, may I ask which antibiotic she is on, and for how many days already?

11. `[RO]` **B:** Ceftriaxonă, două grame pe zi. Astăzi este ziua a patra.

12. `[EN]` **D:** Thank you. Then I would suggest we continue it for seven days and repeat the chest X-ray on Friday.

13. `[RU]` **C:** У нас в аптеке заканчивается флуконазол. Надо срочно сделать заказ, иначе до пятницы не хватит.

14. `[RO]` **A:** Doamna asistentă, vă rog să faceți comanda astăzi. Eu semnez cererea.

15. `[RU]` **C:** Хорошо, я всё оформлю до обеда и принесу вам на подпись.

16. `[RO]` **A:** Mulțumesc tuturor. Dacă nu mai sunt întrebări, ne vedem mâine la aceeași oră.

---

**What the language detector should find**, in this order: `ru` (line 4), `ru` (6), `en` (10), `en` (12), `ru` (13),
`ru` (15). Nothing else: lines 1-3, 5, 7-9, 11, 14 and 16 are Romanian.
