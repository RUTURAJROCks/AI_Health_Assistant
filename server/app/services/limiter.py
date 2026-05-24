import time
from collections import defaultdict
from fastapi import Request, HTTPException, status

class InMemoryLimiter:
    def __init__(self, limit: int, seconds: int):
        self.limit = limit
        self.seconds = seconds
        self.requests = defaultdict(list)

    def check(self, ip: str) -> bool:
        now = time.time()
        # Filter out timestamps older than the window
        self.requests[ip] = [t for t in self.requests[ip] if now - t < self.seconds]
        if len(self.requests[ip]) >= self.limit:
            return False
        self.requests[ip].append(now)
        return True

# Initialize limiters
# 1. Chat / SOAP Note Compile / Image Analysis / RAG Query: 20 per minute
chat_limiter = InMemoryLimiter(limit=20, seconds=60)

# 2. Document Uploads: 5 per minute
upload_limiter = InMemoryLimiter(limit=5, seconds=60)

def rate_limit_chat(request: Request):
    """
    Dependency to rate-limit AI clinical operations.
    Max 20 requests per minute per IP address.
    """
    ip = request.client.host if request.client else "unknown"
    if ip != "unknown" and not chat_limiter.check(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many clinical requests. Please wait a minute before trying again."
        )

def rate_limit_upload(request: Request):
    """
    Dependency to rate-limit document library ingestion.
    Max 5 uploads per minute per IP address.
    """
    ip = request.client.host if request.client else "unknown"
    if ip != "unknown" and not upload_limiter.check(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many upload requests. Please wait a minute before uploading more files."
        )
