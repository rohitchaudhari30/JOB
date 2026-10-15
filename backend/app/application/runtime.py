"""Where the application layer finds the browser, adapter and embedding services (ARC-01).

Use cases need a browser, platform adapters and an embedding model, but the application
layer must not import the code that provides them. So they ask this module instead.
At start-up `app.infrastructure.bootstrap.register_infrastructure()` registers the real
implementations. Until then, using one of them raises a clear error.

The names below behave like the real objects: `browser_manager.create_isolated_context(...)`
is looked up on the registered target at call time, so tests can still patch them.
"""
from typing import Any, Callable, Dict


class ServiceNotRegistered(RuntimeError):
    pass


class _ServiceProxy:
    def __init__(self, name: str) -> None:
        object.__setattr__(self, "_name", name)
        object.__setattr__(self, "_target", None)

    def register(self, target: Any) -> None:
        object.__setattr__(self, "_target", target)

    def is_registered(self) -> bool:
        return object.__getattribute__(self, "_target") is not None

    def __getattr__(self, attr: str) -> Any:
        target = object.__getattribute__(self, "_target")
        if target is None:
            name = object.__getattribute__(self, "_name")
            raise ServiceNotRegistered(
                f"'{name}' is not registered. Call register_infrastructure() at start-up."
            )
        return getattr(target, attr)


class _FactoryProxy:
    """For classes the use case creates itself (DOM analyzer, form engine, screenshot streamer)."""

    def __init__(self, name: str) -> None:
        self._name = name
        self._factory: Callable[..., Any] | None = None

    def register(self, factory: Callable[..., Any]) -> None:
        self._factory = factory

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        if self._factory is None:
            raise ServiceNotRegistered(
                f"'{self._name}' is not registered. Call register_infrastructure() at start-up."
            )
        return self._factory(*args, **kwargs)


browser_manager = _ServiceProxy("browser_manager")
trace_manager = _ServiceProxy("trace_manager")
adapter_registry = _ServiceProxy("adapter_registry")
default_embedding_service = _ServiceProxy("default_embedding_service")
persistence = _ServiceProxy("persistence")  # automation run storage

new_dom_analyzer = _FactoryProxy("new_dom_analyzer")
new_form_engine = _FactoryProxy("new_form_engine")
new_screenshot_streamer = _FactoryProxy("new_screenshot_streamer")


def registered_services() -> Dict[str, bool]:
    """Used by the readiness check and by tests."""
    return {
        "browser_manager": browser_manager.is_registered(),
        "trace_manager": trace_manager.is_registered(),
        "adapter_registry": adapter_registry.is_registered(),
        "default_embedding_service": default_embedding_service.is_registered(),
        "persistence": persistence.is_registered(),
    }
