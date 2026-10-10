class PlatformException(Exception):
    """Base exception for all domain and platform errors."""
    def __init__(self, message: str, status_code: int = 400, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class EntityNotFoundException(PlatformException):
    def __init__(self, entity_name: str, identifier: str):
        super().__init__(
            message=f"{entity_name} with id '{identifier}' was not found.",
            status_code=404,
            details={"entity": entity_name, "id": identifier},
        )


class DuplicateEntityException(PlatformException):
    def __init__(self, entity_name: str, field: str, value: str):
        super().__init__(
            message=f"{entity_name} with {field} '{value}' already exists.",
            status_code=409,
            details={"entity": entity_name, "field": field, "value": value},
        )


class AuthenticationException(PlatformException):
    def __init__(self, message: str = "Invalid authentication credentials."):
        super().__init__(message=message, status_code=401)


class AuthorizationException(PlatformException):
    def __init__(self, message: str = "Not authorized to access this resource."):
        super().__init__(message=message, status_code=403)


class InvalidStateTransitionException(PlatformException):
    def __init__(self, current_state: str, target_state: str, reason: str = ""):
        msg = f"Cannot transition from '{current_state}' to '{target_state}'."
        if reason:
            msg += f" Reason: {reason}"
        super().__init__(
            message=msg,
            status_code=422,
            details={"current_state": current_state, "target_state": target_state, "reason": reason},
        )


class AIProviderException(PlatformException):
    def __init__(self, provider: str, message: str):
        super().__init__(
            message=f"AI Provider error ({provider}): {message}",
            status_code=502,
            details={"provider": provider, "error": message},
        )


class BrowserAutomationException(PlatformException):
    def __init__(self, adapter: str, message: str, details: dict | None = None):
        super().__init__(
            message=f"Browser automation error on {adapter}: {message}",
            status_code=500,
            details={"adapter": adapter, **(details or {})},
        )


class ValidationException(PlatformException):
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message=message, status_code=400, details=details)


class StaleLeaseException(PlatformException):
    """Raised when an operation is attempted with an outdated fencing token or expired lease."""
    def __init__(self, execution_id: str, message: str = "Execution lease is stale or owned by another worker."):
        super().__init__(
            message=message,
            status_code=409,
            details={"execution_id": execution_id},
        )


class QuotaExhaustedException(PlatformException):
    """Raised when daily or hourly application quota limits have been exhausted."""
    def __init__(self, campaign_id: str, quota_type: str = "daily", limit: int = 0):
        super().__init__(
            message=f"{quota_type.capitalize()} quota limit ({limit}) exhausted for campaign [{campaign_id}].",
            status_code=429,
            details={"campaign_id": campaign_id, "quota_type": quota_type, "limit": limit},
        )

