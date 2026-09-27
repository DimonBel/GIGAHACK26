"""Trilingual ICD-10 dictionary, DRG families and the major diagnostic categories."""
import pytest

from mom.medical.coding import drg_families, mdc_of
from mom.medical.dictionary import icd10, label, search


@pytest.mark.parametrize("query, code", [
    ("insuficiență respiratorie", "J96"), ("Insuficienta respiratorie", "J96"), ("дыхательной недостаточности", "J96"),
    ("respiratory failure", "J96"), ("infarct miocardic", "I21"), ("инфаркт миокарда", "I21"), ("I21", "I21"),
    ("j96.0", "J96.0"), ("hidronefr", "N13"), ("гиперкапн", None),
])
def test_search_in_three_languages(query, code):
    found = search(query, 5)
    if code is None:  # not a word of any ICD-10 name: nothing, rather than something unrelated
        assert not found or all("гиперкап" in (r["ru"] or "").lower() for r in found)
    else:
        assert found[0]["code"].startswith(code)


def test_names_in_three_languages():
    row = icd10()["I21"]
    assert row["ro"] == "Infarct miocardic acut" and row["ru"] == "Острый инфаркт миокарда"
    assert label("I21") == "Acute myocardial infarction"
    assert len(icd10()) > 10000


@pytest.mark.parametrize("code, mdc", [("I21.9", 5), ("J96.0", 4), ("N13.3", 11), ("E87.3", 10), ("R57.0", 5),
                                       ("I63.9", 1), ("F10.2", 20), ("A41.9", 18)])
def test_major_diagnostic_category(code, mdc):
    assert mdc_of(code) == mdc


def test_drg_families_of_circulatory_category():
    families = drg_families(5)
    assert "F60" in families and families["F60"]["variants"] == ["F60A", "F60B", "F60C"]
    assert "IMA" in families["F60"]["name"]


def test_code_search_route():
    from fastapi.testclient import TestClient

    from api.app import create_app
    from api.settings import Settings
    from tests.test_api import ELENA, FakePipeline, FakeSMTP
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        app = create_app(Settings(storage_dir=Path(tmp), seed_password="pw"), FakePipeline(), smtp=FakeSMTP)
        c = TestClient(app)
        assert c.get("/api/codes?q=infarct").status_code == 401
        c.post("/api/auth/login", json={"email": ELENA, "password": "pw"})
        found = c.get("/api/codes", params={"q": "инфаркт миокарда"}).json()
        assert found[0]["code"] == "I21" and found[0]["ro"] == "Infarct miocardic acut"
