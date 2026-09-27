import io
import json
import math

import numpy as np
import pytest
import soundfile as sf

from stt.asr.chunks import Chunk, chunk_audio, pad_segments, plan_chunks, to_recording
from stt.asr.decode import capitalize, confidence, looping, parse_verbose
from stt.asr.languages import transcribe_chunk
from stt.asr.transcriber import transcribe_wav
from stt.asr.transcript import Segment, Transcript, Word
from stt.asr.vad import parse_segments


def test_vad_output_is_parsed_from_centiseconds():
    out = "Detected 2 speech segments:\nSpeech segment 0: start = 0.00, end = 86.00\n" \
          "Speech segment 1: start = 103.00, end = 416.00\n"
    assert parse_segments(out) == [(0.0, 0.86), (1.03, 4.16)]


def test_speech_is_packed_into_chunks_of_at_most_28_seconds_without_the_pauses():
    segments = [(0, 5), (5.5, 10), (30, 40), (60, 70), (70.2, 75)]
    assert [c.pieces for c in plan_chunks(segments)] == [
        [(0, 5), (5.5, 10), (30, 40)],  # 19.5 s of speech: the 20 s pause before (30, 40) is left out
        [(60, 70), (70.2, 75)],         # adding (60, 70) would make 29.5 s
    ]


def test_each_segment_gets_context_of_at_most_half_the_pause_to_its_neighbours():
    padded = pad_segments([(0.0, 5.0), (5.1, 8.0), (10.0, 12.0)])
    assert [t for segment in padded for t in segment] == pytest.approx([0.0, 5.05, 5.05, 8.15, 9.85, 12.15])


def test_times_in_a_joined_clip_are_moved_back_to_the_recording():
    audio = np.zeros(16000 * 20, dtype=np.float32)
    clip, timeline = chunk_audio(Chunk([(2.0, 4.0), (10.0, 11.0)]), audio, 16000)
    assert len(clip) == 3 * 16000 and timeline == [(0.0, 2.0), (2.0, 10.0)]
    [(start, end, [first, second])] = to_recording([[0.5, 2.5, [Word(0.5, 1.0, "a"), Word(2.2, 2.5, "b")]]],
                                                    timeline)
    assert (start, end) == (2.5, 10.5)
    assert (first.start, first.end, second.start, second.end) == (2.5, 3.0, pytest.approx(10.2), 10.5)


def test_confidence_is_the_mean_log_probability_of_the_words():
    assert confidence([Word(0, 1, "a", prob=1.0), Word(1, 2, "b", prob=math.exp(-1))]) == pytest.approx(-0.5)
    assert confidence([]) == float("-inf")


# --- choosing the language by Whisper's confidence ---

LANGS = ("ro", "ru", "en")
ROMANIAN = "Pacientul are nevoie de transfer la reanimare"
GARBLED = "Cărășo davaite snaceală pasmotrim analizî"  # Russian speech, Whisper forced into Romanian
RUSSIAN = "Хорошо давайте сначала посмотрим анализы"
MEDPARK = "Pentru dânsul eu mă știu el cumva e mai bine dar știu că el e tacit"  # real, but unsure Romanian
TRANSLATION = "Если он будет в пабе то он будет адекватно мониторить нас"  # Whisper forced into Russian
ENGLISH = "The deadline for the quarterly report is next Friday"


def fake_whisper(transcripts: dict, calls: list, guess: dict = None):
    """decode() / detect() for one 10 s chunk: per language, the Whisper segments it returns, as
    (start, end, confidence, text); guess is Whisper's language guess."""
    def decode(chunk, lang, quick=False):
        calls.append(lang + ("?" if quick else ""))  # "ru?": the quick Russian pass, for Russian words
        out = []
        for s, e, score, text in transcripts.get(lang, []):
            words = text.split()
            step = (e - s) / len(words)
            out.append([s, e, [Word(s + i * step, s + (i + 1) * step, w, prob=math.exp(score))
                               for i, w in enumerate(words)]])
        return out

    def detect(chunk):
        calls.append("detect")
        return guess or {"ru": 0.7, "ro": 0.2, "en": 0.05}  # Moldovan Romanian often sounds Russian to Whisper
    return decode, detect


def chunk(transcripts, guess=None):
    calls = []
    decode, detect = fake_whisper(transcripts, calls, guess)
    pieces = transcribe_chunk(decode, Chunk([(0, 10)]), LANGS, detect)
    return [(s, e, lang) for s, e, lang, _ in pieces], calls


def test_romanian_whisper_is_sure_of_is_transcribed_once():
    pieces, calls = chunk({"ro": [(0, 5, -0.1, ROMANIAN), (5, 10, -0.2, ROMANIAN)]})
    assert pieces == [(0, 5, "ro"), (5, 10, "ro")] and calls == ["ro", "ru?"]  # "ru?": only to find Russian words


def test_russian_heard_as_latin_nonsense_takes_the_russian_sentence():
    pieces, calls = chunk({"ro": [(0, 5, -0.05, ROMANIAN), (5, 10, -0.8, GARBLED)],
                           "ru": [(0, 5, -0.9, TRANSLATION), (5, 10, -0.05, RUSSIAN)]})
    assert pieces == [(0, 5, "ro"), (5, 10, "ru")]
    assert calls == ["ro", "ru"]  # Whisper was unsure of one sentence, not of the chunk: no language guess


def test_translation_never_replaces_real_romanian():
    # Medpark 4:30: unsure but real Romanian; Whisper forced into Russian translated it, confidently.
    pieces, _ = chunk({"ro": [(0, 5, -0.8, GARBLED), (5, 10, -0.8, MEDPARK)],
                       "ru": [(0, 5, -0.05, RUSSIAN), (5, 10, -0.05, TRANSLATION)]})
    assert pieces == [(0, 5, "ru"), (5, 10, "ro")]


def test_unsure_russian_does_not_replace_the_sentence():
    pieces, _ = chunk({"ro": [(0, 10, -0.8, GARBLED)], "ru": [(0, 10, -0.4, RUSSIAN)]})
    assert pieces == [(0, 10, "ro")]


def test_russian_must_beat_real_romanian_by_the_handicap():
    # Whisper is sure the chunk is Russian, but it heard real Romanian: Russian must be clearly more confident.
    pieces, _ = chunk({"ro": [(0, 5, -0.9, MEDPARK), (5, 10, -0.4, MEDPARK)],
                       "ru": [(0, 5, -0.2, TRANSLATION), (5, 10, -0.2, TRANSLATION)]}, guess={"ru": 0.95, "ro": 0.03})
    assert pieces == [(0, 5, "ru"), (5, 10, "ro")]


def test_nonsense_is_replaced_even_when_whisper_is_sure_of_it():
    # The Moldovan model writes Russian speech the way it sounds, confidently: the nonsense itself tells.
    pieces, calls = chunk({"ro": [(0, 10, -0.1, GARBLED)], "ru": [(0, 10, -0.25, RUSSIAN)]})
    assert pieces == [(0, 10, "ru")] and calls == ["ro", "ru"]


def test_russian_translated_into_romanian_is_caught_when_whisper_is_sure_it_is_russian():
    # Whisper forced into Romanian translated clear Russian: real words, low confidence.
    transcripts = {"ro": [(0, 10, -0.7, MEDPARK)], "ru": [(0, 10, -0.25, TRANSLATION)]}
    pieces, calls = chunk(transcripts, guess={"ru": 0.98, "ro": 0.01})
    assert pieces == [(0, 10, "ru")] and calls == ["ro", "detect", "ru"]
    pieces, calls = chunk(transcripts)  # Whisper's usual guess on Moldovan Romanian: Russian, but not sure
    assert pieces == [(0, 10, "ro")] and calls == ["ro", "detect", "ru?"]


def test_english_is_transcribed_only_when_whisper_guesses_english():
    english = {"ro": [(0, 10, -0.8, MEDPARK)], "en": [(0, 10, -0.05, ENGLISH)]}
    pieces, calls = chunk(english, guess={"en": 0.3, "uk": 0.2, "ru": 0.1})
    assert pieces == [(0, 10, "en")] and calls == ["ro", "detect", "en", "ru?"]
    # A confident translation into English is never made when Whisper guesses another language.
    pieces, calls = chunk(english)
    assert pieces == [(0, 10, "ro")] and "en" not in calls


def test_russian_is_kept_when_the_romanian_transcript_is_empty():
    # Forced into Romanian, turbo invented "Mulțumim pentru vizionare" on Russian speech: dropped, nothing left.
    pieces, calls = chunk({"ro": [], "ru": [(0, 10, -0.1, RUSSIAN)]}, guess={"ru": 0.97, "ro": 0.02})
    assert pieces == [(0, 10, "ru")] and calls == ["ro", "detect", "ru"]


def test_short_sentence_is_not_rechecked():
    pieces, calls = chunk({"ro": [(0, 9.5, -0.05, ROMANIAN), (9.5, 10, -0.8, GARBLED)]})
    assert calls == ["ro", "ru?"]


# --- parsing whisper-server output ---

def tok(text, start, end, p=0.9):
    return {"word": text, "start": start, "end": end, "probability": p}


def test_verbose_json_tokens_become_words_on_the_recording_timeline():
    result = {"segments": [
        {"start": 0.0, "end": 1.0, "words": [tok(" Bine", 0.0, 0.3), tok(",", 0.3, 0.35), tok(" pa", 0.4, 0.6),
                                              tok("cientul", 0.6, 1.0, p=0.5), tok("[_TT_50]", 1.0, 1.0)]},
        {"start": 1.0, "end": 2.0, "words": [tok(" Bine", 1.0, 1.3), tok(",", 1.3, 1.35), tok(" pa", 1.4, 1.6),
                                              tok("cientul", 1.6, 2.0)]},  # repeats the previous one -> dropped
        {"start": 2.0, "end": 2.5, "words": []},                            # empty -> dropped
    ]}
    [(start, end, words)] = parse_verbose(result, offset=10.0)
    assert (start, end) == (10.0, 11.0)
    assert [(w.text, w.start, w.end, w.prob) for w in words] == [("Bine,", 10.0, 10.35, 0.9),
                                                                 ("pacientul", 10.4, 11.0, 0.5)]


def test_bare_space_token_starts_a_new_word():
    # Whisper has no " ț" token: "fiecare țesut" comes as " fiecare", " ", "ț", "esut".
    result = {"segments": [
        {"start": 0.0, "end": 1.0, "words": [tok(" fiecare", 0.0, 0.4), tok(" ", 0.4, 0.4), tok("ț", 0.4, 0.5),
                                              tok("esut", 0.5, 0.8)]},
        {"start": 1.0, "end": 2.0, "words": [tok(" ", 1.0, 1.0), tok("Ț", 1.0, 1.1), tok("ine", 1.1, 1.3),
                                              tok("ți", 1.3, 1.5)]},
    ]}
    first, second = parse_verbose(result, offset=0.0)
    assert [w.text for w in first[2]] == ["fiecare", "țesut"]
    assert [w.text for w in second[2]] == ["Țineți"]


def seg(start, end, text, p=0.9):
    """A verbose_json segment with one token per word."""
    words = text.split()
    step = (end - start) / len(words)
    return {"start": start, "end": end,
            "words": [tok(" " + w, start + i * step, start + (i + 1) * step, p) for i, w in enumerate(words)]}


def test_repetition_loops_are_cut():
    # Inside a segment: a phrase repeated 3+ times is kept once.
    [(_, _, words)] = parse_verbose({"segments": [seg(0, 5, "Nu am văzut niciodată niciodată niciodată niciodată.")]}, 0)
    assert " ".join(w.text for w in words) == "Nu am văzut niciodată."
    # Across segments: a segment repeating one of the last three is dropped.
    loop = [seg(i, i + 1, text) for i, text in enumerate(["Mă, și s-a?", "Мы с Кутурми.", "А что?", "Мы с Кутурми.",
                                                          "А что?", "Să scoateți modemul."])]
    assert [" ".join(w.text for w in ws) for _, _, ws in parse_verbose({"segments": loop}, 0)] == [
        "Mă, și s-a?", "Мы с Кутурми.", "А что?", "Să scoateți modemul."]


def test_a_loop_spelled_differently_each_time_is_detected():
    words = [w for i in range(12) for w in (" dacă", " ea", " o", " măș" if i % 2 else " mă", " năzale,")]
    assert looping({"segments": [{"words": [tok(w, 0, 1) for w in words]}]})
    speech = ("Pacientul din patul 8, el a fost pe data de 11 octombrie cu infarct miocardic, a fost tromboaspirație "
              "făcută, mitrala 3, fracția de 38-40. Da, el e pacient cardiac și trivascular, nu? Trivascular, da.")
    assert not looping({"segments": [seg(0, 20, speech)]})


def test_sentence_starts_are_capitalized():
    words = [Word(0, 1, "pacientul"), Word(1, 2, "e"), Word(2, 3, "stabil."), Word(3, 4, "da,"), Word(4, 5, "bine")]
    assert capitalize(words, True) is False
    assert [w.text for w in words] == ["Pacientul", "e", "stabil.", "Da,", "bine"]
    words = [Word(0, 1, "iar"), Word(1, 2, "ECG-ul.")]
    assert capitalize(words, False) is True and words[0].text == "iar"  # continues the sentence before


def test_sentences_in_other_scripts_are_invented():
    from stt.asr.decode import OTHER_SCRIPTS
    assert not OTHER_SCRIPTS.search("Pacientul, короче, e în ședință de reanimare. Deadline Friday, 38-40%!")
    assert OTHER_SCRIPTS.search("Și asta acum cinqρού stron") and OTHER_SCRIPTS.search("봐요")


def test_invented_subtitle_phrases_are_dropped():
    for text in ["Să vă mulțumim pentru vizionare.", "Mulțumesc de vizionare!", "Продолжение следует..."]:
        assert parse_verbose({"segments": [seg(0, 2, text)]}, 0) == []


def test_word_split_across_two_whisper_segments_stays_whole():
    result = {"segments": [
        {"start": 0.0, "end": 0.5, "words": [tok(" Pac", 0.0, 0.5)]},
        {"start": 0.5, "end": 1.5, "words": [tok("ientul", 0.5, 0.9), tok(" din", 1.0, 1.5)]},
    ]}
    first, second = parse_verbose(result, offset=0.0)
    assert [w.text for w in first[2]] == ["Pacientul"] and first[1] == 0.9
    assert [w.text for w in second[2]] == ["din"]


def test_transcript_output_is_tagged_with_languages_and_accent():
    ro_ru = [Word(0, 1, "Pacientul,", "ro"), Word(1, 2, "короче,", "ru"), Word(2, 3, "stabil.", "ro")]
    en = [Word(4, 5, "Deadline", "en"), Word(5, 6, "Friday.", "en")]
    t = Transcript("ro", [Segment("00:00:00.000", "00:00:03.000", "Pacientul, короче, stabil.", "ro", "", ro_ru),
                          Segment("00:00:04.000", "00:00:06.000", "Deadline Friday.", "en", "us", en)],
                   ro_ru + en)
    assert t.to_text() == "[ro+ru] Pacientul, короче, stabil.\n[en, American] Deadline Friday."
    assert "00:00:04,000 --> 00:00:06,000\n[en, American] Deadline Friday." in t.to_srt()
    data = json.loads(t.to_json())
    assert data["segments"][1]["accent"] == "us"
    assert [w["lang"] for w in data["segments"][0]["words"]] == ["ro", "ru", "ro"]


# --- transcribe_wav end to end, with fake VAD and whisper-server (no models needed) ---

LEVEL = {0.1: "ro", 0.2: "ru", 0.3: "en"}  # the fake recording's loudness says which language is spoken
SPEECH = [(0.0, 3.0, 0.1), (3.5, 6.0, 0.2), (6.5, 9.0, 0.3)]
SAID = {"ro": [" Bine", ",", " davai", " facem", "."], "ru": [" Хорошо", ",", " давайте", " сначала", " посмотрим", "."],
        "en": [" Deadline", " Friday", "."]}
# What Whisper forced into a language writes for speech in another one: Russian becomes Latin-letter nonsense
# in Romanian; Romanian becomes a Russian translation.
GUESSED = {("ro", "ru"): [" Cărășo", ",", " davaite", " snaceală", " pasmotrim", "."],
           ("ru", "ro"): [" Хорошо", ",", " делаем", "."]}


def regions(audio, sr):
    """(start, end, language) of the fake speech in a clip."""
    frames = np.abs(audio[:len(audio) // 160 * 160]).reshape(-1, 160).mean(axis=1)  # 10 ms frames
    out = []
    for i, level in enumerate(frames):
        lang = LEVEL.get(round(float(level), 1))
        if lang and out and out[-1][2] == lang and out[-1][1] == i / 100:
            out[-1][1] = (i + 1) / 100
        elif lang:
            out.append([i / 100, (i + 1) / 100, lang])
    return out


class FakeServer:
    """Like Whisper: sure of its words only in the language that is spoken (English speech stays English in
    any language); forced into another one it is unsure (GUESSED). A model named "moldovan..." writes in
    lowercase; one named "...loops" gets stuck repeating a phrase."""
    requests = []
    models = []  # (model file, language) of every transcription

    def __init__(self, model, language="auto", translate=False):
        self.model = str(model)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        pass

    def transcribe_verbose(self, wav_bytes, language, quick=False):
        FakeServer.requests.append(language + ("?" if quick else ""))
        FakeServer.models.append((self.model, language))
        audio, sr = sf.read(io.BytesIO(wav_bytes), dtype="float32")
        segments = []
        for start, end, spoken in regions(audio, sr):
            if self.model.endswith("loops"):
                words, p = [w for i in range(12) for w in (" dacă", " ea", " o", " măș" if i % 2 else " mă")], 0.9
            elif language == spoken or spoken == "en":
                words, p = SAID[spoken], 0.95 if language == spoken else 0.9
            else:
                words, p = GUESSED[language, spoken], 0.5
            if self.model.startswith("moldovan"):
                words = [w.lower() for w in words]
            step = (end - start) / len(words)
            segments.append({"start": start, "end": end, "words": [
                tok(w, start + i * step, start + (i + 1) * step, p) for i, w in enumerate(words)]})
        return {"segments": segments}

    def detect_language(self, wav_bytes):
        """Whisper's guess: the language spoken longest in the clip."""
        FakeServer.requests.append("detect")
        audio, sr = sf.read(io.BytesIO(wav_bytes), dtype="float32")
        seconds = {}
        for start, end, spoken in regions(audio, sr):
            seconds[spoken] = seconds.get(spoken, 0.0) + end - start
        return {lang: s / sum(seconds.values()) for lang, s in seconds.items()}


@pytest.fixture
def fake_pipeline(monkeypatch, tmp_path):
    audio = np.zeros(int(9.5 * 16000), dtype=np.float32)
    for start, end, level in SPEECH:
        audio[int(start * 16000):int(end * 16000)] = level
    wav = tmp_path / "meeting.wav"
    sf.write(str(wav), audio, 16000, subtype="PCM_16")
    monkeypatch.setattr("stt.asr.vad.speech_segments", lambda path: [(s, e) for s, e, _ in SPEECH])
    monkeypatch.setattr("stt.asr.whisper_cpp.WhisperServer", FakeServer)
    FakeServer.requests, FakeServer.models = [], []
    return wav


def quiet(segments):
    pass


def test_every_sentence_ends_up_in_its_language(fake_pipeline):
    t = transcribe_wav(fake_pipeline, on_segments=quiet, accents=False)
    assert t.to_text() == ("[ro+ru] Bine, давай facem.\n[ru] Хорошо, давайте сначала посмотрим.\n"
                           "[en] Deadline Friday.")
    assert t.language == "ro"  # the most speech (3 s)
    # The Russian sentence came out as nonsense in Romanian: the chunk once more in Russian, nothing else.
    assert FakeServer.requests == ["ro", "ru"]
    # Times are on the recording's timeline, although the pauses were cut out of the clip.
    assert [(s.start[:8], s.end[:8]) for s in t.segments] == [("00:00:00", "00:00:03"), ("00:00:03", "00:00:06"),
                                                              ("00:00:06", "00:00:09")]


def test_forced_language_is_transcribed_once_and_translation_is_tagged_english(fake_pipeline):
    t = transcribe_wav(fake_pipeline, language="ro", on_segments=quiet, accents=False)
    assert FakeServer.requests == ["ro"]
    assert t.language == "ro" and t.segments[0].tag == "ro+ru"
    t = transcribe_wav(fake_pipeline, language="ro", translate=True, on_segments=quiet, accents=False)
    assert t.segments[0].tag == "en" and "davai" in t.text  # a translation is English: nothing rewritten


def test_no_speech_gives_an_empty_transcript(fake_pipeline, monkeypatch):
    monkeypatch.setattr("stt.asr.vad.speech_segments", lambda path: [])
    t = transcribe_wav(fake_pipeline, on_segments=quiet)
    assert t.segments == [] and t.language == "" and FakeServer.requests == []


def test_the_romanian_model_transcribes_romanian_and_the_main_model_the_rest(fake_pipeline):
    t = transcribe_wav(fake_pipeline, model="large-v3", romanian_model="moldovan", on_segments=quiet, accents=False)
    assert FakeServer.models == [("moldovan", "ro"), ("large-v3", "ru")]
    # The same sentences, and the Moldovan model's lowercase sentence start is capitalized.
    assert t.to_text() == ("[ro+ru] Bine, давай facem.\n[ru] Хорошо, давайте сначала посмотрим.\n"
                           "[en] Deadline friday.")


def test_a_chunk_the_romanian_model_loops_on_is_redone_with_the_main_model(fake_pipeline):
    t = transcribe_wav(fake_pipeline, model="large-v3", romanian_model="moldovan-loops", language="ro",
                       on_segments=quiet, accents=False)
    assert FakeServer.models == [("moldovan-loops", "ro"), ("large-v3", "ro")]
    assert t.segments[0].text == "Bine, давай facem."


def test_mlx_beam_search_finds_the_likelier_sentence_greedy_would_miss():
    mx = pytest.importorskip("mlx.core")
    from stt.asr.mlx import _BeamSearch

    class Inference:
        def rearrange_kv_cache(self, sources):
            self.sources = sources

    eot, inference = 3, Inference()
    beam = _BeamSearch(2, eot, inference)

    def logits(*rows):
        return mx.log(mx.array(rows, dtype=mx.float32) + 1e-9)

    # Step 1: token 1 (0.5) is likelier than token 2 (0.4): greedy would take 1.
    tokens, done, sums = beam.update(mx.array([[0], [0]]), logits([.1, .5, .4, 0], [.1, .5, .4, 0]), mx.zeros(2))
    assert tokens.tolist() == [[0, 1], [0, 2]] and not done.item()
    # Step 2: after 2 the sentence ends (0.4 * 0.9); nothing after 1 is likely (0.5 * 0.3 at best).
    tokens, done, sums = beam.update(tokens, logits([.3, .3, .3, .1], [.05, .05, 0, .9]), sums)
    assert inference.sources == [0, 0] and not done.item()  # both kept beams continue after 1
    # Step 3: the sentences after 1 end too (0.5 * 0.3 * 0.8 = 0.12 < 0.36).
    tokens, done, sums = beam.update(tokens, logits([.1, .1, 0, .8], [.1, .1, 0, .8]), sums)
    assert done.item()  # two sentences have ended
    best, scores = beam.finalize(tokens.reshape(1, 2, -1), sums.reshape(1, 2))
    assert best.tolist()[0][int(mx.argmax(scores[0]).item())] == [0, 2, eot, eot]
