import os
from typing import List, Dict, Any, Optional
import chromadb
from app.config import settings

class VectorStore:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.chroma_db_path
        
        # Ensure database directory exists
        os.makedirs(self.db_path, exist_ok=True)
        
        # Initialize local persistent client
        self.client = chromadb.PersistentClient(path=self.db_path)
        
        # Initialize collection
        self.collection = self.client.get_or_create_collection(
            name="medical_knowledge",
            metadata={"hnsw:space": "cosine"} # Use cosine similarity space
        )

    def add_documents(self, documents: List[Dict[str, Any]], embeddings: List[List[float]]):
        """
        Adds text chunks and their pre-computed embedding vectors into ChromaDB.
        
        Documents list matches the parser output format:
        [{"text": "chunk text", "metadata": {...}}]
        """
        if not documents:
            return
            
        ids = [doc["metadata"]["chunk_id"] for doc in documents]
        texts = [doc["text"] for doc in documents]
        metadatas = [doc["metadata"] for doc in documents]
        
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=texts
        )

    def query_similarity(self, query_embedding: List[float], top_k: int = 4) -> List[Dict[str, Any]]:
        """
        Queries ChromaDB for nearest matching documents based on the query embedding.
        
        Returns a list of dictionaries with matching text, metadata, and distance.
        """
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k
        )
        
        formatted_results = []
        
        # Extract matching arrays
        ids = results.get("ids", [[]])[0]
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        
        for i in range(len(ids)):
            formatted_results.append({
                "id": ids[i],
                "text": documents[i],
                "metadata": metadatas[i],
                "distance": distances[i], # Cosine distance
                "similarity": 1.0 - distances[i] # Cosine similarity score
            })
            
        return formatted_results

    def clear_collection(self):
        """Deletes the collection and starts fresh."""
        try:
            self.client.delete_collection("medical_knowledge")
            self.collection = self.client.get_or_create_collection(
                name="medical_knowledge",
                metadata={"hnsw:space": "cosine"}
            )
        except Exception:
            pass

    def delete_document(self, file_name: str):
        """Deletes all chunks associated with a specific file name from ChromaDB."""
        try:
            self.collection.delete(where={"source_file": file_name})
        except Exception:
            pass

    def get_stats(self) -> Dict[str, Any]:
        """Returns statistics about the collection."""
        try:
            count = self.collection.count()
            # Fetch all metadata to get unique files
            results = self.collection.get(include=["metadatas"])
            metadatas = results.get("metadatas", [])
            
            unique_files = set()
            for m in metadatas:
                if m and "source_file" in m:
                    unique_files.add(m["source_file"])
                    
            return {
                "total_chunks": count,
                "total_files": len(unique_files),
                "indexed_files": list(unique_files)
            }
        except Exception as e:
            return {
                "total_chunks": 0,
                "total_files": 0,
                "indexed_files": [],
                "error": str(e)
            }

# Global database client singleton
db_client = VectorStore()
