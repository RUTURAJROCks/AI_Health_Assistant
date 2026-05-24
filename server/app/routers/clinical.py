from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional

from app.services.gemini import analyze_medical_image, compile_soap_note, get_text_embedding
from app.services.db import db_client
from app.services.limiter import rate_limit_chat

router = APIRouter(
    prefix="/api/clinical",
    tags=["Clinical Operations"]
)

# Pydantic schema for SOAP compiling
class SOAPRequestModel(BaseModel):
    hpi_notes: str = Field(..., description="Chief complaint, HPI history, patient profile details.")
    visual_findings: Optional[str] = Field(None, description="Physical visual observation summary from previous scan analysis.")
    use_rag: bool = Field(default=True, description="Ground the SOAP compilation with reference documents from Vector DB.")
    rag_query: Optional[str] = Field(None, description="Optional vector database search query. Defaults to HPI if omitted.")


@router.post("/analyze-image", dependencies=[Depends(rate_limit_chat)])
async def analyze_scan(
    file: UploadFile = File(...),
    prompt: Optional[str] = Form(None)
):
    """
    Accepts a medical scan (PNG, JPG, BMP) and conducts an automated multimodal
    visual study utilizing gemini-2.5-flash with safety instruction guardrails.
    """
    # Verify file content types
    if file.content_type not in ["image/png", "image/jpeg", "image/jpg", "image/bmp"]:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image format. Please upload PNG, JPG, JPEG, or BMP scans."
        )
        
    try:
        file_bytes = await file.read()
        analysis = analyze_medical_image(
            image_bytes=file_bytes,
            mime_type=file.content_type,
            user_prompt=prompt
        )
        return {
            "status": "success",
            "file_name": file.filename,
            "content_type": file.content_type,
            "analysis": analysis
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diagnostic visual study failed: {str(e)}")


@router.post("/compile-soap", dependencies=[Depends(rate_limit_chat)])
async def compile_patient_case(body: SOAPRequestModel):
    """
    Compiles patient history, visual findings, and contextually matching guidelines
    retrieved from ChromaDB into a high-fidelity, validated medical SOAP Note structure.
    """
    try:
        retrieved_contexts = []
        
        # 1. Optionally retrieve grounded evidence from local vector database
        if body.use_rag:
            # Determine vector search query term
            search_query = body.rag_query or body.hpi_notes
            
            try:
                # Generate embedding and query ChromaDB
                query_vector = get_text_embedding(search_query)
                matches = db_client.query_similarity(query_vector, top_k=3)
                retrieved_contexts = [match["text"] for match in matches]
            except Exception as db_err:
                # Log DB error, proceed without RAG rather than crashing clinical compile
                print(f"RAG warning in SOAP compilation: {str(db_err)}")
                
        # 2. Compile structured validated SOAP Note using Gemini structured response schema
        soap_note = compile_soap_note(
            hpi_notes=body.hpi_notes,
            visual_findings=body.visual_findings,
            retrieved_contexts=retrieved_contexts
        )
        
        return soap_note
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compile structured SOAP Note: {str(e)}")
