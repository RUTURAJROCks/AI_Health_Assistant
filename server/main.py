import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.services.db import db_client
from app.routers.rag import router as rag_router
from app.routers.clinical import router as clinical_router

app = FastAPI(
    title="AI Health Assistant API",
    description="Full-stack clinical RAG & multimodal analysis engine.",
    version="1.0.0"
)

# Configure CORS — dynamic origins from FRONTEND_URL env var
# In production, set FRONTEND_URL to your Render static site URL
allowed_origins = [
    settings.frontend_url,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
# Deduplicate in case frontend_url is already a localhost variant
allowed_origins = list(set(allowed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include modular clinical & RAG endpoint routers
app.include_router(rag_router)
app.include_router(clinical_router)

@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "AI Health Assistant FastAPI Backend is active.",
        "docs_url": "/docs"
    }

@app.get("/api/health")
async def health_check():
    """Simple system health and status reporting endpoint."""
    has_api_key = bool(settings.gemini_api_key)
    return {
        "status": "healthy",
        "api_key_configured": has_api_key,
        "chroma_db_connected": True
    }

@app.get("/api/db/stats")
async def get_database_stats():
    """Returns total indexed documents and files stored in ChromaDB."""
    return db_client.get_stats()

@app.post("/api/db/clear")
async def clear_database():
    """Resets the vector database."""
    db_client.clear_collection()
    return {"status": "success", "message": "Vector database cleared successfully."}


if __name__ == "__main__":
    print(f"Starting server on {settings.host}:{settings.port}...")
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True
    )
