import io
import re
from typing import List, Dict

# Pure Python Recursive Character Text Splitter
# Follows production RAG guides (O'Reilly Learning LangChain) by recursively splitting
# by double newlines, single newlines, spaces, and finally characters, to preserve semantic blocks.

class RecursiveTextSplitter:
    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 150):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split_text(self, text: str) -> List[str]:
        if not text or not text.strip():
            return []
        
        # We recursively split on these delimiters in order of preference
        separators = ["\n\n", "\n", " ", ""]
        return self._split(text, separators)

    def _split(self, text: str, separators: List[str]) -> List[str]:
        # If the text is already under chunk size, return it as a single chunk
        if len(text) <= self.chunk_size:
            return [text]

        # Select separator
        separator = separators[0] if separators else ""
        next_seps = separators[1:] if len(separators) > 1 else []

        # Split text by separator
        if separator:
            splits = text.split(separator)
        else:
            splits = list(text)

        chunks = []
        current_chunk = ""

        for split in splits:
            # If current split itself exceeds chunk_size, split it further with the next separators
            if len(split) > self.chunk_size:
                if current_chunk:
                    chunks.append(current_chunk)
                    current_chunk = ""
                # Recursively split the long block
                sub_chunks = self._split(split, next_seps)
                chunks.extend(sub_chunks)
            else:
                # Add to current chunk if it fits
                candidate = current_chunk + (separator if current_chunk else "") + split
                if len(candidate) <= self.chunk_size:
                    current_chunk = candidate
                else:
                    # Current chunk is full, save it
                    if current_chunk:
                        chunks.append(current_chunk)
                    # Start a new chunk, incorporating overlap if possible
                    # Clean sliding overlap
                    overlap_source = current_chunk
                    if overlap_source:
                        overlap_text = overlap_source[-self.chunk_overlap:]
                        current_chunk = overlap_text + (separator if overlap_text else "") + split
                    else:
                        current_chunk = split

        if current_chunk:
            chunks.append(current_chunk)

        # Post-process: clean up whitespace
        return [c.strip() for c in chunks if c.strip()]


def parse_pdf(file_bytes: bytes) -> str:
    """Extracts text from PDF bytes using PyPDF."""
    from pypdf import PdfReader
    pdf_file = io.BytesIO(file_bytes)
    reader = PdfReader(pdf_file)
    text = ""
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"
    return text


def parse_docx(file_bytes: bytes) -> str:
    """Extracts text from DOCX bytes using python-docx with fallback."""
    try:
        from docx import Document
        docx_file = io.BytesIO(file_bytes)
        doc = Document(docx_file)
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text
    except Exception as e:
        # Fallback to general unicode text parsing if python-docx isn't available
        return file_bytes.decode("utf-8", errors="ignore")


def parse_document(file_name: str, file_bytes: bytes) -> str:
    """Routing document parsing based on file extension."""
    ext = file_name.split(".")[-1].lower()
    if ext == "pdf":
        return parse_pdf(file_bytes)
    elif ext in ["docx", "doc"]:
        return parse_docx(file_bytes)
    else:
        # Default to raw text decoding
        return file_bytes.decode("utf-8", errors="ignore")


def chunk_document(file_name: str, text: str, chunk_size: int = 800, chunk_overlap: int = 150) -> List[Dict]:
    """Chunks the text and generates enriched metadata objects."""
    splitter = RecursiveTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    chunks = splitter.split_text(text)
    
    docs_to_index = []
    for idx, chunk in enumerate(chunks):
        docs_to_index.append({
            "text": chunk,
            "metadata": {
                "source_file": file_name,
                "chunk_id": f"{file_name}_chunk_{idx}",
                "chunk_index": idx,
                "length": len(chunk)
            }
        })
    return docs_to_index
