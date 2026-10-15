"""Guards the layer rules that were fixed in ARC-01 and ARC-02."""
import pathlib
import re

APP = pathlib.Path(__file__).resolve().parents[2] / "app"


def _python_files(folder: str):
    return [p for p in (APP / folder).rglob("*.py")]


def test_inner_layers_do_not_import_the_api_layer():
    pattern = re.compile(r"^\s*(from|import)\s+app\.api\b", re.MULTILINE)
    offenders = [
        str(p.relative_to(APP))
        for folder in ("domain", "application", "infrastructure", "workers")
        for p in _python_files(folder)
        if pattern.search(p.read_text())
    ]
    assert offenders == []


def test_domain_layer_does_not_import_infrastructure():
    pattern = re.compile(r"^\s*(from|import)\s+app\.infrastructure\b", re.MULTILINE)
    offenders = [str(p.relative_to(APP)) for p in _python_files("domain") if pattern.search(p.read_text())]
    assert offenders == []


def test_automation_router_does_not_open_its_own_sessions():
    text = (APP / "api" / "v1" / "automation.py").read_text()
    assert "AsyncSessionLocal" not in text


def test_application_layer_does_not_import_infrastructure():
    """ARC-01: use cases reach browsers, adapters and models only through ports and repositories."""
    pattern = re.compile(r"^\s*(from|import)\s+app\.infrastructure\b", re.MULTILINE)
    offenders = [str(p.relative_to(APP)) for p in _python_files("application") if pattern.search(p.read_text())]
    assert offenders == []


def test_runtime_services_are_registered_by_the_app():
    from app.application import runtime

    assert all(runtime.registered_services().values())
