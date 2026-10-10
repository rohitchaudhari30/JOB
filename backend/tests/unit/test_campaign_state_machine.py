import pytest
from app.domain.campaigns.state_machine import (
    CampaignStateEnum,
    CampaignStateMachine,
    ExecutionStateEnum,
    ExecutionStateMachine,
    InvalidStateTransitionException,
)


def test_valid_campaign_transitions():
    # DRAFT -> SCHEDULED
    CampaignStateMachine.validate_transition(CampaignStateEnum.DRAFT, CampaignStateEnum.SCHEDULED)
    # SCHEDULED -> RUNNING
    CampaignStateMachine.validate_transition(CampaignStateEnum.SCHEDULED, CampaignStateEnum.RUNNING)
    # RUNNING -> PAUSED
    CampaignStateMachine.validate_transition(CampaignStateEnum.RUNNING, CampaignStateEnum.PAUSED)
    # PAUSED -> RUNNING
    CampaignStateMachine.validate_transition(CampaignStateEnum.PAUSED, CampaignStateEnum.RUNNING)
    # RUNNING -> COMPLETED
    CampaignStateMachine.validate_transition(CampaignStateEnum.RUNNING, CampaignStateEnum.COMPLETED)
    # COMPLETED -> ARCHIVED
    CampaignStateMachine.validate_transition(CampaignStateEnum.COMPLETED, CampaignStateEnum.ARCHIVED)


def test_invalid_campaign_transitions():
    # ARCHIVED cannot transition to anything
    with pytest.raises(InvalidStateTransitionException):
        CampaignStateMachine.validate_transition(CampaignStateEnum.ARCHIVED, CampaignStateEnum.RUNNING)

    # DRAFT cannot transition directly to COMPLETED
    with pytest.raises(InvalidStateTransitionException):
        CampaignStateMachine.validate_transition(CampaignStateEnum.DRAFT, CampaignStateEnum.COMPLETED)


def test_valid_execution_transitions():
    # INITIALIZING -> RUNNING
    ExecutionStateMachine.validate_transition(ExecutionStateEnum.INITIALIZING, ExecutionStateEnum.RUNNING)
    # RUNNING -> PAUSED_OTP
    ExecutionStateMachine.validate_transition(ExecutionStateEnum.RUNNING, ExecutionStateEnum.PAUSED_OTP)
    # PAUSED_OTP -> RUNNING
    ExecutionStateMachine.validate_transition(ExecutionStateEnum.PAUSED_OTP, ExecutionStateEnum.RUNNING)
    # RUNNING -> PAUSED_LIMIT
    ExecutionStateMachine.validate_transition(ExecutionStateEnum.RUNNING, ExecutionStateEnum.PAUSED_LIMIT)
    # RUNNING -> COMPLETED
    ExecutionStateMachine.validate_transition(ExecutionStateEnum.RUNNING, ExecutionStateEnum.COMPLETED)


def test_invalid_execution_transitions():
    # COMPLETED is terminal
    with pytest.raises(InvalidStateTransitionException):
        ExecutionStateMachine.validate_transition(ExecutionStateEnum.COMPLETED, ExecutionStateEnum.RUNNING)

    # INITIALIZING cannot transition directly to PAUSED_OTP
    with pytest.raises(InvalidStateTransitionException):
        ExecutionStateMachine.validate_transition(ExecutionStateEnum.INITIALIZING, ExecutionStateEnum.PAUSED_OTP)
