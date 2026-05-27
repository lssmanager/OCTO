from src.reclaim_lineage import validate_checkpoint_lineage


def rec(i, step, parent):
    return {'id': i, 'step_index': step, 'parent_checkpoint_id': parent, 'state_json': {'messages': []}}


def test_valid_lineage():
    rows = [rec('c0',0,None), rec('c1',1,'c0'), rec('c2',2,'c1')]
    assert validate_checkpoint_lineage(rows) is True


def test_broken_lineage_parent_missing():
    rows = [rec('c0',0,None), rec('c2',2,'missing')]
    assert validate_checkpoint_lineage(rows) is False
