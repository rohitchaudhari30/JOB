"""Registers the real browser, adapter and embedding implementations with the application layer."""
from app.application import runtime


def register_infrastructure() -> None:
    from app.infrastructure.ai.embedding_service import default_embedding_service
    from app.infrastructure.browser.adapters.registry import adapter_registry
    from app.infrastructure.browser.browser_manager import browser_manager
    from app.infrastructure.browser.dom_analyzer import DOMAnalyzer
    from app.infrastructure.browser.form_engine import FormEngine
    from app.infrastructure.browser.screenshot_streamer import ScreenshotStreamer
    from app.infrastructure.browser.trace_manager import trace_manager
    from app.infrastructure.database.run_persistence import SqlRunPersistence

    runtime.browser_manager.register(browser_manager)
    runtime.trace_manager.register(trace_manager)
    runtime.adapter_registry.register(adapter_registry)
    runtime.default_embedding_service.register(default_embedding_service)
    runtime.persistence.register(SqlRunPersistence())
    runtime.new_dom_analyzer.register(DOMAnalyzer)
    runtime.new_form_engine.register(FormEngine)
    runtime.new_screenshot_streamer.register(ScreenshotStreamer)
