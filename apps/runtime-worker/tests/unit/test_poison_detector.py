from app.retry.poison_detector import PoisonDetector

def test_poison_key_tenant_scoped():
    k=PoisonDetector().build_key('t1','e1',1,'ERR')
    assert k.startswith('octo:t1:poison:')
