"""Medical lexicon: drug names and terms as Large V3 and the fine-tuned Turbo (turbo-md) misspell them."""
import pytest

from mom.minutes.lexicon import normalize


@pytest.mark.parametrize("heard, fixed", [
    ("miropinem si cu amicacin", "meropenem si cu amikacină"),        # Large V3
    ("miropineam și cu amecacin", "meropenem și cu amikacină"),       # turbo-md
    ("clepsiele și candida", "Klebsiella și candida"),
    ("clepsielă și candida", "Klebsiella și candida"),
    ("am introdus Diacarbo", "am introdus Diacarb (acetazolamidă)"),
    ("am introdus deacarpul", "am introdus Diacarb (acetazolamidă)"),
    ("dozele de norodrenalina", "dozele de noradrenalină"),
    ("dozele de norodrimonina", "dozele de noradrenalină"),
    ("nor 0.22", "noradrenalină 0.22"),
    ("de două ori cu clerunsul", "de două ori cu clearance"),
    ("de două ori cu clirumsul", "de două ori cu clearance"),
    ("zonele de lictizie", "zonele de atelectazie"),
    ("zonele de lectezie", "zonele de atelectazie"),
    ("cineva din terapeuți pentru BIP-up", "cineva din terapeuți pentru BiPAP"),
])
def test_misspelled_terms_are_fixed(heard, fixed):
    assert normalize(heard) == fixed


@pytest.mark.parametrize("word", ["noros", "amiciție", "clasa", "diagnostic", "deasupra", "clerical", "bipolar"])
def test_ordinary_words_are_left_alone(word):
    assert normalize(word) == word
