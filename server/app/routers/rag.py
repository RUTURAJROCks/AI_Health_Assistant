from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional

from app.config import settings
from app.services.parser import parse_document, chunk_document
from app.services.gemini import get_text_embedding, get_text_embeddings_batch, generate_rag_chat
from app.services.db import db_client

router = APIRouter(
    prefix="/api/rag",
    tags=["RAG & Document Library"]
)

# Pydantic schemas for RAG operations
class QueryModel(BaseModel):
    question: str = Field(..., description="The medical/pharmaceutical query to search for.")
    top_k: int = Field(default=4, ge=1, le=10, description="Number of context matches to retrieve.")

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Ingests, recursively chunks, vectorizes (text-embedding-004),
    and indexes a medical document (PDF, TXT, DOCX) into ChromaDB.
    """
    try:
        file_bytes = await file.read()
        
        # Enforce maximum upload size (default 10MB)
        max_bytes = settings.max_upload_mb * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum upload size is {settings.max_upload_mb}MB."
            )
        
        # 1. Parse document content based on extension
        text = parse_document(file.filename, file_bytes)
        if not text.strip():
            raise HTTPException(status_code=400, detail="Document appears to be empty or unreadable.")
            
        # 2. Chunk document recursively (O'Reilly LangChain best practices)
        chunks = chunk_document(file.filename, text)
        if not chunks:
            raise HTTPException(status_code=400, detail="Failed to parse document into logical text chunks.")
            
        # 3. Batch generate embeddings for performance optimization
        texts_to_embed = [chunk["text"] for chunk in chunks]
        embeddings = get_text_embeddings_batch(texts_to_embed)
        
        # 4. Upsert chunks and embeddings into our persistent ChromaDB
        db_client.add_documents(chunks, embeddings)
        
        return {
            "status": "success",
            "message": f"Successfully indexed '{file.filename}' into the vector library.",
            "file_name": file.filename,
            "total_chunks": len(chunks)
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest document: {str(e)}")


@router.delete("/delete")
async def delete_document(file_name: str):
    """
    Deletes all chunks associated with a specific document from ChromaDB.
    """
    try:
        db_client.delete_document(file_name)
        return {
            "status": "success",
            "message": f"Successfully deleted '{file_name}' from the vector library.",
            "file_name": file_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")


@router.post("/query")
async def query_knowledge_base(body: QueryModel):
    """
    Performs similarity vector query on ChromaDB and returns a
    fully grounded, cited Gemini response based on retrieved guidelines.
    """
    try:
        # 1. Vectorize query string
        query_vector = get_text_embedding(body.question)
        
        # 2. Retrieve nearest neighbor matches using Cosine distance in Chroma
        matches = db_client.query_similarity(query_vector, top_k=body.top_k)
        
        # 3. If no matches exist in the DB, run default conversational RAG
        if not matches:
            response = generate_rag_chat(body.question, [])
            return {
                "response": response,
                "citations": []
            }
            
        # 4. Compile context strings and prompt the LLM
        contexts = [match["text"] for match in matches]
        response = generate_rag_chat(body.question, contexts)
        
        return {
            "response": response,
            "citations": matches
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Similarity query failed: {str(e)}")
