from app.contracts.generated.ExecutionSchema import State
from app.fsm.types import TERMINAL_STATES, VALID_TRANSITIONS


def test_python_fsm_states_match_generated_execution_contract() -> None:
    contract_states = {state.value for state in State}
    fsm_states = set(VALID_TRANSITIONS.keys())
    for targets in VALID_TRANSITIONS.values():
        fsm_states.update(targets)

    assert fsm_states == contract_states
    assert TERMINAL_STATES == {"completed", "failed", "cancelled"}


def test_canonical_happy_path_transitions() -> None:
    assert "dispatched" in VALID_TRANSITIONS["queued"]
    assert "running" in VALID_TRANSITIONS["dispatched"]
    for terminal in ("completed", "failed", "cancelled"):
        assert terminal in VALID_TRANSITIONS["running"]
        assert VALID_TRANSITIONS[terminal] == set()
