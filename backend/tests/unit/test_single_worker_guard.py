import pytest

import main


def test_one_worker_is_fine(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    main.ensure_single_worker_process()


def test_several_workers_are_refused(monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    with pytest.raises(RuntimeError, match="single"):
        main.ensure_single_worker_process()
