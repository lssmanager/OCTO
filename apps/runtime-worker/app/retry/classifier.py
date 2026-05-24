class ErrorClassifier:
    MAP={'TimeoutError':'TOOL_TIMEOUT','RateLimitError':'PROVIDER_RATE_LIMIT','ValueError':'INVARIANT_BREACH'}
    def classify(self, err: Exception)->str: return self.MAP.get(type(err).__name__,'RUNTIME_TRANSIENT')
