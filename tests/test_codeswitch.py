from stt.codeswitch import cyrillic_readings, tag_words
from stt.transcriber import Word


def tagged(text: str, lang: str = "ro") -> list:
    words = [Word(i, i + 1, t) for i, t in enumerate(text.split())]
    tag_words(words, lang)
    return [(w.text, w.lang) for w in words]


def test_latin_spelled_russian_words_are_written_in_cyrillic():
    # How Whisper writes Moldovan speech: Romanian with Russian words spelled as they sound.
    assert tagged("Bine, deci pacientul din salonul 8. Căroce. Are nevoie de transfer.") == [
        ("Bine,", "ro"), ("deci", "ro"), ("pacientul", "ro"), ("din", "ro"), ("salonul", "ro"), ("8.", "ro"),
        ("Короче.", "ru"), ("Are", "ro"), ("nevoie", "ro"), ("de", "ro"), ("transfer.", "ro")]
    assert tagged("analizele sunt gata, davai le discutăm, normalna?") == [
        ("analizele", "ro"), ("sunt", "ro"), ("gata,", "ro"), ("давай", "ru"), ("le", "ro"), ("discutăm,", "ro"),
        ("нормально?", "ru")]


def test_english_style_spellings_are_recognized_too():
    assert ("короче", "ru") in tagged("pacientul koroche e stabil")


def test_english_terms_inside_romanian_are_tagged_english():
    assert tagged("mâine avem meeting despre deadline") == [
        ("mâine", "ro"), ("avem", "ro"), ("meeting", "en"), ("despre", "ro"), ("deadline", "en")]


def test_romanian_words_and_short_ambiguous_words_stay_romanian():
    # "vot" (vote), "da", "nu" are Romanian words too: never rewritten.
    assert tagged("da nu vot tot are") == [("da", "ro"), ("nu", "ro"), ("vot", "ro"), ("tot", "ro"), ("are", "ro")]


def test_romanian_words_that_look_russian_are_never_rewritten():
    # Romanian words that read as Russian words (cognates, missing diacritics): a false rewrite is worse
    # than a missed Russian word.
    text = "Cito! diagnoza pomadă negativa specialisti severa masina analize"
    assert tagged(text) == [(w, "ro") for w in text.split()]


def test_rare_romanian_words_on_the_keep_list_stay_latin():
    # Missing from wordfreq's Romanian list, but would read as врач, работа, мало, печать, круто, якобы.
    assert tagged("vrac robotă molă picati cruta") == [(w, "ro") for w in "vrac robotă molă picati cruta".split()]
    assert tagged("Iacobi a spus")[0] == ("Iacobi", "ro")


def test_all_caps_stays_all_caps():
    assert tagged("DAVAI") == [("ДАВАЙ", "ru")]


def test_names_inside_a_sentence_are_left_alone():
    assert tagged("a vorbit cu Ivan despre asta")[3] == ("Ivan", "ro")
    assert tagged("Хорошо, Popescu", lang="ru")[1] == ("Popescu", "ro")  # unknown Latin word: Romanian name


def test_cyrillic_words_are_russian_and_latin_words_in_russian_speech_get_their_language():
    assert tagged("Хорошо, давайте посмотрим salonul deadline", lang="ru") == [
        ("Хорошо,", "ru"), ("давайте", "ru"), ("посмотрим", "ru"), ("salonul", "ro"), ("deadline", "en")]


def test_numbers_keep_the_segment_language():
    assert tagged("80 pe 40") == [("80", "ro"), ("pe", "ro"), ("40", "ro")]


def test_cyrillic_readings_cover_vowel_reduction():
    assert "короче" in cyrillic_readings("caroce")
    assert "хорошо" in cyrillic_readings("cărășo")


def test_russian_words_in_latin_letters_take_the_russian_transcripts_spelling():
    from stt.codeswitch import russian_words_heard
    from stt.transcriber import Word
    # "Dinamica e pozitivă, cisto, tak" with "чисто, так" said inside a Romanian sentence.
    words = [Word(0, 1, "Dinamica"), Word(1, 2, "e"), Word(2, 3, "pozitivă,"), Word(3, 4, "cisto,"), Word(4, 5, "tak.")]
    russian = [Word(0, 1, "Динамика"), Word(1.1, 2, "есть"), Word(2, 3, "позитивная,"), Word(3.1, 4, "чисто,"),
               Word(4, 5.2, "так.")]
    assert russian_words_heard(words, russian) == 2
    assert [w.text for w in words] == ["Dinamica", "e", "pozitivă,", "чисто,", "так."]
    assert [w.lang for w in words[3:]] == ["ru", "ru"]


def test_a_russian_word_must_sound_alike_and_be_said_at_the_same_time():
    from stt.codeswitch import russian_words_heard
    from stt.transcriber import Word
    words = [Word(0, 1, "Uzgrăci"), Word(1, 2, "vot")]
    # A translation ("одиннадцать") doesn't sound alike; "вот" was said 3 s later.
    assert russian_words_heard(words, [Word(0, 1, "одиннадцать"), Word(4.5, 5, "вот")]) == 0
    assert [w.text for w in words] == ["Uzgrăci", "vot"]


def test_misheard_romanian_words_are_corrected_and_real_ones_left_alone():
    from stt.spelling import correct_words
    from stt.transcriber import Word
    said = "Pocentul mitrala fraccia gluconazol cordajul Popescu EKS lecă disiunea pacientului"
    words = [Word(i, i + 1, text, lang="ro") for i, text in enumerate(said.split())]
    assert correct_words(words) == 3
    # Corrected: a vowel or a similar consonant off. Left alone: real and medical words, names, abbreviations,
    # short words, and a word no real word is close to ("disiunea": "misiunea" would be a consonant swap).
    assert " ".join(w.text for w in words) == \
        "Pacientul mitrala fracția fluconazol cordajul Popescu EKS lecă disiunea pacientului"


def test_only_romanian_words_are_corrected():
    from stt.spelling import correct_words
    from stt.transcriber import Word
    words = [Word(0, 1, "deadlinul", lang="en"), Word(1, 2, "pocentul", lang="ru")]
    assert correct_words(words) == 0
