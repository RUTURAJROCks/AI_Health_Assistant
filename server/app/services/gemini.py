import os
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

from app.config import settings
from app.prompts import RAG_SYSTEM_PROMPT, SOAP_SYSTEM_PROMPT, IMAGE_ANALYTICS_SYSTEM_PROMPT

# Pydantic Schemas for Structured SOAP Note Compilation
# Aligned with clinical standards in open-design case formats.

class SubjectiveModel(BaseModel):
    hpi: str = Field(description="History of Present Illness - a chronological, detailed clinical narrative of the symptoms.")
    pmh: str = Field(description="Past Medical History - relevant medical conditions, surgeries, and family history.")
    medications: List[str] = Field(default=[], description="List of active patient medications.")
    allergies: List[str] = Field(default=[], description="List of patient drug/food allergies.")

class VitalsModel(BaseModel):
    blood_pressure: str = Field(description="Vital: blood pressure, e.g., '120/80 mmHg'")
    heart_rate: int = Field(description="Vital: heart rate in bpm, e.g., 72")
    respiratory_rate: int = Field(description="Vital: respiratory rate in breaths/min, e.g., 16")
    temperature: float = Field(description="Vital: core body temperature in °C, e.g., 37.0")

class ObjectiveModel(BaseModel):
    vitals: VitalsModel
    physical_exam: str = Field(description="Physically detailed systematic exam findings by body system.")
    labs_and_imaging: List[str] = Field(default=[], description="Observed lab values, metrics, and visual diagnostic imaging findings.")

class DifferentialModel(BaseModel):
    diagnosis: str = Field(description="Clinical name of the differential diagnosis.")
    supporting_evidence: str = Field(description="Specific patient parameters or retrieved evidence that support this diagnosis.")
    refuting_evidence: str = Field(description="Specific parameters or evidence that make this diagnosis less likely.")

class AssessmentModel(BaseModel):
    primary_diagnosis: str = Field(description="Primary diagnostic consideration based on evidence.")
    clinical_reasoning: str = Field(description="Logical clinical defense of why the primary diagnosis is the most likely.")
    differentials: List[DifferentialModel] = Field(description="Exactly 3 to 5 relevant clinical differentials.")
    risk_stratification: Optional[str] = Field(None, description="Validated clinical risk stratification score (e.g. CURB-65, Wells score, TIMI index).")

class SOAPNoteModel(BaseModel):
    subjective: SubjectiveModel
    objective: ObjectiveModel
    assessment: AssessmentModel
    plan: List[str] = Field(description="Numbered management plan actions organized numerically by active problem (include drugs, precise doses, routes, frequencies).")
    disclaimer: str = Field(description="Mandatory simulated/educational case record notice.")


# Safe Client Factory
def _get_gemini_client() -> genai.Client:
    api_key = settings.gemini_api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set. Please add it to your server/.env file.")
    return genai.Client(api_key=api_key)


def get_text_embedding(text: str) -> List[float]:
    """Generates a 768-dimensional dense vector for a text chunk using text-embedding-004."""
    client = _get_gemini_client()
    try:
        response = client.models.embed_content(
            model="text-embedding-004",
            contents=text
        )
        # Handle different output styles in SDK
        if hasattr(response, "embedding"):
            return response.embedding.values
        elif hasattr(response, "embeddings") and response.embeddings:
            return response.embeddings[0].values
        return response.values
    except Exception as e:
        raise RuntimeError(f"Failed to generate vector embedding: {str(e)}")


def get_text_embeddings_batch(texts: List[str]) -> List[List[float]]:
    """Generates embedding vectors for a list of text chunks in a batch call to optimize latency."""
    if not texts:
        return []
    client = _get_gemini_client()
    try:
        response = client.models.embed_content(
            model="text-embedding-004",
            contents=texts
        )
        embeddings = []
        if hasattr(response, "embeddings"):
            embeddings = [emb.values for emb in response.embeddings]
        else:
            embeddings = [emb.values for emb in response]
        return embeddings
    except Exception as e:
        raise RuntimeError(f"Batch embedding generation failed: {str(e)}")


def analyze_medical_image(image_bytes: bytes, mime_type: str, user_prompt: Optional[str] = None) -> str:
    """
    Performs visual analysis on a medical scan using gemini-2.5-flash,
    applying the isolated IMAGE_ANALYTICS_SYSTEM_PROMPT.
    """
    client = _get_gemini_client()
    prompt = user_prompt or "Provide a complete visual study of this clinical image scan."
    
    contents = [
        types.Part.from_bytes(
            data=image_bytes,
            mime_type=mime_type
        ),
        prompt
    ]
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=IMAGE_ANALYTICS_SYSTEM_PROMPT
            )
        )
        return response.text
    except Exception as e:
        raise RuntimeError(f"Multimodal visual study failed: {str(e)}")


def generate_rag_chat(query: str, retrieved_contexts: List[str]) -> str:
    """
    Generates a conversational response to a medical query grounded strictly
    on retrieved reference documents from ChromaDB, applying RAG_SYSTEM_PROMPT.
    """
    client = _get_gemini_client()
    
    # Structure the grounded context under clear XML tags
    context_str = ""
    for idx, ctx in enumerate(retrieved_contexts):
        context_str += f"<clinical_reference id='{idx}'>\n{ctx}\n</clinical_reference>\n\n"
        
    prompt = f"Context Material:\n{context_str}\nUser Question: {query}"
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=RAG_SYSTEM_PROMPT
            )
        )
        return response.text
    except Exception as e:
        raise RuntimeError(f"Grounded RAG text generation failed: {str(e)}")


def compile_soap_note(hpi_notes: str, visual_findings: Optional[str] = None, retrieved_contexts: Optional[List[str]] = None) -> SOAPNoteModel:
    """
    Compiles a structured, strictly schema-validated SOAP Note using gemini-2.5-flash.
    Incorporates patient profile, image analysis, and vector store references.
    """
    client = _get_gemini_client()
    
    context_block = ""
    if retrieved_contexts:
        context_block += "Retrieved Clinical Guidelines:\n"
        for ctx in retrieved_contexts:
            context_block += f"- {ctx}\n"
            
    visual_block = f"Visual Diagnostic Findings:\n{visual_findings}\n" if visual_findings else ""
    
    prompt = (
        f"Input History & Notes:\n{hpi_notes}\n\n"
        f"{visual_block}\n"
        f"{context_block}\n"
        "Generate the complete structured SOAP note matching the required output format."
    )
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SOAPNoteModel,
                system_instruction=SOAP_SYSTEM_PROMPT
            )
        )
        # Parse output text directly using Pydantic validating schema
        return SOAPNoteModel.model_validate_json(response.text)
    except Exception as e:
        raise RuntimeError(f"Structured SOAP note compilation failed: {str(e)}")
