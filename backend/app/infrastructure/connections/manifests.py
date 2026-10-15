from typing import Dict, List, Optional
from app.domain.connections.entities import (
    ConnectionType,
    PlatformCapability,
    PlatformCategory,
    PlatformManifest,
)


SUPPORTED_PLATFORMS: Dict[str, PlatformManifest] = {
    "naukri": PlatformManifest(
        platform_id="naukri",
        display_name="Naukri",
        category=PlatformCategory.PORTAL_DISCOVERY,
        connection_type=ConnectionType.BROWSER_SESSION,
        capabilities=[
            PlatformCapability.JOB_SEARCH,
            PlatformCapability.JOB_DETAILS,
            PlatformCapability.APPLICATION,
            PlatformCapability.APPLICATION_STATUS,
        ],
        login_url="https://www.naukri.com/nlogin/login",
        is_auth_required=True,
        description="India's leading job portal. Connect your account for automated discovery and 1-Click Fast Apply.",
    ),
    "linkedin": PlatformManifest(
        platform_id="linkedin",
        display_name="LinkedIn",
        category=PlatformCategory.PORTAL_DISCOVERY,
        connection_type=ConnectionType.BROWSER_SESSION,
        capabilities=[
            PlatformCapability.JOB_SEARCH,
            PlatformCapability.JOB_DETAILS,
            PlatformCapability.APPLICATION,
        ],
        login_url="https://www.linkedin.com/login",
        is_auth_required=True,
        description="Professional network job board. Supports Easy Apply automation with authorized session.",
    ),
    "greenhouse": PlatformManifest(
        platform_id="greenhouse",
        display_name="Greenhouse ATS",
        category=PlatformCategory.ATS_APPLICATION,
        connection_type=ConnectionType.PUBLIC_ACCESS,
        capabilities=[
            PlatformCapability.JOB_SEARCH,
            PlatformCapability.JOB_DETAILS,
            PlatformCapability.APPLICATION,
        ],
        login_url="",
        is_auth_required=False,
        description="Direct company career page and ATS application automation. No login credentials needed.",
    ),
    "lever": PlatformManifest(
        platform_id="lever",
        display_name="Lever ATS",
        category=PlatformCategory.ATS_APPLICATION,
        connection_type=ConnectionType.PUBLIC_ACCESS,
        capabilities=[
            PlatformCapability.JOB_SEARCH,
            PlatformCapability.JOB_DETAILS,
        ],
        login_url="",
        is_auth_required=False,
        description="Company job board discovery. Applying through Lever is not automated yet.",
    ),
    "workday": PlatformManifest(
        platform_id="workday",
        display_name="Workday Career Portal",
        category=PlatformCategory.ATS_APPLICATION,
        connection_type=ConnectionType.PUBLIC_ACCESS,
        capabilities=[
            PlatformCapability.JOB_SEARCH,
            PlatformCapability.JOB_DETAILS,
        ],
        login_url="",
        is_auth_required=False,
        description="Company job board discovery. Applying through Workday is not automated yet.",
    ),
    "ashby": PlatformManifest(
        platform_id="ashby",
        display_name="Ashby ATS",
        category=PlatformCategory.ATS_APPLICATION,
        connection_type=ConnectionType.PUBLIC_ACCESS,
        capabilities=[
            PlatformCapability.JOB_SEARCH,
            PlatformCapability.JOB_DETAILS,
        ],
        login_url="",
        is_auth_required=False,
        description="Company job board discovery. Applying through Ashby is not automated yet.",
    ),
}


class PlatformManifestRegistry:
    @staticmethod
    def list_all() -> List[PlatformManifest]:
        return list(SUPPORTED_PLATFORMS.values())

    @staticmethod
    def get(platform_id: str) -> Optional[PlatformManifest]:
        return SUPPORTED_PLATFORMS.get(platform_id.lower().strip())
