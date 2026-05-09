#!/usr/bin/env python3
"""
Solidity Code Retrieval by Natural Language Description

This script loads Solidity code from a Parquet file, embeds both the natural language query
and code snippets using Ollama or OpenRouter embeddings, and retrieves the most similar
Solidity code snippets based on cosine similarity.

Usage:
    python find_solidity_by_nl.py --file sources_10000_20000.parquet --query "ERC20 token transfer" --top-k 5
    python find_solidity_by_nl.py --provider openrouter --router-key YOUR_KEY --query "ERC20 token transfer" --top-k 5

Requirements:
    - pyarrow
    - numpy
    - requests
    - scipy
    - Ollama with nomic-embed-text model, or OpenRouter with Gemini Embedding 2 Preview
"""

import argparse
import json
import os
import sys
import time
from typing import List, Tuple, Optional

import numpy as np
import pyarrow.parquet as pq
import requests
from scipy.spatial.distance import cosine


class OllamaEmbedder:
    """Handles embedding generation using an Ollama embedding model."""

    def __init__(self, model_name: str = "nomic-embed-text:latest", base_url: str = "http://localhost:11434"):
        self.model_name = model_name
        self.base_url = base_url
        self.actual_model_name = None  # Will be set during connection test
        self._test_connection()

    def _test_connection(self) -> None:
        """Test connection to Ollama server."""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code != 200:
                raise ConnectionError(f"Ollama API returned {response.status_code}")
            models = response.json().get("models", [])
            # Find the actual model name (with or without :latest suffix)
            for model in models:
                model_name = model.get("name")
                if model_name == self.model_name or model_name.startswith(self.model_name + ":"):
                    self.actual_model_name = model_name
                    return
            available_models = [m.get("name") for m in models]
            raise ValueError(f"Model '{self.model_name}' not found. Available models: {available_models}")
        except requests.exceptions.RequestException as e:
            raise ConnectionError(f"Cannot connect to Ollama at {self.base_url}: {e}")

    def embed_text(self, text: str, max_length: int = 8192) -> np.ndarray:
        """Generate embedding for a single text with smart truncation."""
        if self.actual_model_name is None:
            raise ValueError("Model not initialized. Call _test_connection first.")

        # Smart truncation: try to preserve complete functions/contracts
        if len(text) > max_length:
            # Try to find natural break points (function/contract boundaries)
            truncated = self._smart_truncate(text, max_length)
            print(f"Smart truncated text from {len(text)} to {len(truncated)} characters")
        else:
            truncated = text

        # Debug: ensure truncated is not None
        if truncated is None:
            print(f"Warning: _smart_truncate returned None for text of length {len(text)}")
            truncated = text[:max_length]  # Fallback

        payload = {"model": self.actual_model_name, "prompt": truncated}

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.post(f"{self.base_url}/api/embeddings", json=payload, timeout=60)
                response.raise_for_status()
                embedding = response.json()["embedding"]
                return np.array(embedding, dtype=np.float32)
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2  # Exponential backoff
                    print(f"Request failed (attempt {attempt + 1}/{max_retries}): {e}")
                    print(f"Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    raise e

    def _smart_truncate(self, text: str, max_length: int) -> str:
        """Smart truncation that preserves code structure."""
        if len(text) <= max_length:
            return text

        # Simple strategy: Cut at line boundaries, preferring complete lines
        lines = text[:max_length + 200].split('\n')
        result = ''
        for line in lines:
            if len(result + line + '\n') <= max_length:
                result += line + '\n'
            else:
                break

        # Remove trailing whitespace
        result = result.rstrip()
        if not result:
            # Fallback to hard truncation
            result = text[:max_length]

        return result

    def embed_text_chunked(self, text: str, chunk_size: int = 4096, overlap: int = 512) -> np.ndarray:
        """Generate embedding for long text by chunking and averaging."""
        if len(text) <= chunk_size:
            return self.embed_text(text, max_length=len(text))

        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - overlap  # Overlap for context preservation
            if start >= len(text):
                break

        print(f"Split text into {len(chunks)} chunks for embedding")

        # Embed each chunk
        chunk_embeddings = []
        for i, chunk in enumerate(chunks):
            try:
                emb = self.embed_text(chunk, max_length=len(chunk))
                chunk_embeddings.append(emb)
            except Exception as e:
                print(f"Warning: Failed to embed chunk {i+1}: {e}")
                continue

        if not chunk_embeddings:
            raise ValueError("Failed to embed any chunks")

        # Average the embeddings (simple approach)
        # For better results, could use more sophisticated pooling
        avg_embedding = np.mean(chunk_embeddings, axis=0)
        return avg_embedding

    def embed_batch(self, texts: List[str], batch_size: int = 5, max_length: int = 8192, use_chunked: bool = False) -> np.ndarray:
        """Generate embeddings for a batch of texts."""
        embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_num = i//batch_size + 1
            total_batches = (len(texts) + batch_size - 1)//batch_size
            print(f"Embedding batch {batch_num}/{total_batches} ({len(batch)} texts)")

            batch_embeddings = []
            for j, text in enumerate(batch):
                try:
                    if use_chunked:
                        emb = self.embed_text_chunked(text)
                    else:
                        emb = self.embed_text(text, max_length=max_length)
                    batch_embeddings.append(emb)
                except Exception as e:
                    print(f"Warning: Failed to embed text {j+1} in batch {batch_num}: {e}")
                    # Use zero vector as fallback
                    batch_embeddings.append(np.zeros(768, dtype=np.float32))  # nomic-embed-text dimension

            embeddings.extend(batch_embeddings)

            # Add delay between batches to prevent overwhelming the server
            if batch_num < total_batches:
                time.sleep(0.5)

        return np.array(embeddings, dtype=np.float32)


class OpenRouterEmbedder:
    """Handles embedding generation using OpenRouter-compatible embedding APIs."""

    def __init__(self, model_name: str = "baai/bge-m3", base_url: str = "https://openrouter.ai/api/v1", api_key: Optional[str] = None):
        self.model_name = model_name
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("OpenRouter API key is required. Set OPENROUTER_API_KEY or pass --router-key.")
        self._test_connection()

    def _test_connection(self) -> None:
        """Test connection to OpenRouter service."""
        headers = {"Authorization": f"Bearer {self.api_key}"}
        response = requests.get(f"{self.base_url}/models", headers=headers, timeout=10)
        if response.status_code != 200:
            raise ConnectionError(f"OpenRouter API returned {response.status_code}: {response.text}")

        models = response.json().get("models", [])
        ids = [m.get("id") for m in models if isinstance(m, dict)]
        if ids and self.model_name not in ids:
            raise ValueError(f"Model '{self.model_name}' not found on OpenRouter. Available models: {ids}")

    def embed_text(self, text: str, max_length: int = 8192) -> np.ndarray:
        """Generate embedding for a single text with smart truncation."""
        if len(text) > max_length:
            truncated = self._smart_truncate(text, max_length)
            print(f"Smart truncated text from {len(text)} to {len(truncated)} characters")
        else:
            truncated = text

        payload = {
            "model": self.model_name,
            "input": truncated,
            "encodingFormat": "float",
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.post(f"{self.base_url}/embeddings", json=payload, headers=headers, timeout=60)
                response.raise_for_status()
                data = response.json().get("data")
                if not data or not isinstance(data, list):
                    raise ValueError("Invalid OpenRouter embedding response format")
                embedding = data[0].get("embedding")
                return np.array(embedding, dtype=np.float32)
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    print(f"Request failed (attempt {attempt + 1}/{max_retries}): {e}")
                    print(f"Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    raise e

    def _smart_truncate(self, text: str, max_length: int) -> str:
        """Smart truncation that preserves code structure."""
        if len(text) <= max_length:
            return text

        lines = text[:max_length + 200].split('\n')
        result = ''
        for line in lines:
            if len(result + line + '\n') <= max_length:
                result += line + '\n'
            else:
                break

        result = result.rstrip()
        if not result:
            result = text[:max_length]

        return result

    def embed_text_chunked(self, text: str, chunk_size: int = 4096, overlap: int = 512) -> np.ndarray:
        """Generate embedding for long text by chunking and averaging."""
        if len(text) <= chunk_size:
            return self.embed_text(text, max_length=len(text))

        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - overlap
            if start >= len(text):
                break

        print(f"Split text into {len(chunks)} chunks for embedding")
        chunk_embeddings = []
        for i, chunk in enumerate(chunks):
            try:
                emb = self.embed_text(chunk, max_length=len(chunk))
                chunk_embeddings.append(emb)
            except Exception as e:
                print(f"Warning: Failed to embed chunk {i+1}: {e}")
                continue

        if not chunk_embeddings:
            raise ValueError("Failed to embed any chunks")

        avg_embedding = np.mean(chunk_embeddings, axis=0)
        return avg_embedding

    def embed_batch(self, texts: List[str], batch_size: int = 5, max_length: int = 8192, use_chunked: bool = False) -> np.ndarray:
        """Generate embeddings for a batch of texts."""
        embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_num = i//batch_size + 1
            total_batches = (len(texts) + batch_size - 1)//batch_size
            print(f"Embedding batch {batch_num}/{total_batches} ({len(batch)} texts)")

            batch_embeddings = []
            for j, text in enumerate(batch):
                try:
                    if use_chunked:
                        emb = self.embed_text_chunked(text)
                    else:
                        emb = self.embed_text(text, max_length=max_length)
                    batch_embeddings.append(emb)
                except Exception as e:
                    print(f"Warning: Failed to embed text {j+1} in batch {batch_num}: {e}")
                    batch_embeddings.append(np.zeros(768, dtype=np.float32))

            embeddings.extend(batch_embeddings)

            if batch_num < total_batches:
                time.sleep(0.5)

        return np.array(embeddings, dtype=np.float32)


class SolidityRetriever:
    """Handles loading Parquet data and performing similarity search."""

    def __init__(self, parquet_path: str, content_column: str = "content", cache_suffix: Optional[str] = None):
        self.parquet_path = parquet_path
        self.content_column = content_column
        self.contents: List[str] = []
        if cache_suffix:
            sanitized_suffix = cache_suffix.replace('/', '_').replace(':', '_').replace(' ', '_')
            self.embeddings_path = parquet_path.replace('.parquet', f'_{sanitized_suffix}_embeddings.npy')
        else:
            self.embeddings_path = parquet_path.replace('.parquet', '_embeddings.npy')
        self.embeddings: Optional[np.ndarray] = None

    def load_data(self) -> None:
        """Load Solidity code contents from Parquet file."""
        print(f"Loading data from {self.parquet_path}...")
        table = pq.read_table(self.parquet_path, columns=[self.content_column])
        self.contents = table[self.content_column].to_pylist()
        print(f"Loaded {len(self.contents)} code snippets")

    def load_or_compute_embeddings(self, embedder: OllamaEmbedder, force_rebuild: bool = False, batch_size: int = 5, max_length: int = 8192, use_chunked: bool = False) -> None:
        """Load cached embeddings or compute new ones."""
        if os.path.exists(self.embeddings_path) and not force_rebuild:
            print(f"Loading cached embeddings from {self.embeddings_path}")
            self.embeddings = np.load(self.embeddings_path)
            if len(self.embeddings) != len(self.contents):
                print("Warning: Embedding cache size mismatch, rebuilding...")
                force_rebuild = True
            else:
                return

        if force_rebuild or not os.path.exists(self.embeddings_path):
            print("Computing embeddings for all code snippets...")
            start_time = time.time()
            self.embeddings = embedder.embed_batch(self.contents, batch_size, max_length, use_chunked)
            np.save(self.embeddings_path, self.embeddings)
            elapsed = time.time() - start_time
            print(f"Computed embeddings in {elapsed:.2f} seconds")

    def search(self, query_embedding: np.ndarray, top_k: int = 5) -> List[Tuple[int, float, str]]:
        """Search for most similar code snippets."""
        if self.embeddings is None:
            raise ValueError("Embeddings not loaded. Call load_or_compute_embeddings first.")

        similarities = []
        for i, emb in enumerate(self.embeddings):
            # Cosine similarity (1 - cosine distance)
            sim = 1 - cosine(query_embedding, emb)
            similarities.append((i, sim, self.contents[i]))

        # Sort by similarity (descending)
        similarities.sort(key=lambda x: x[1], reverse=True)
        return similarities[:top_k]


def main():
    parser = argparse.ArgumentParser(description="Find Solidity code by natural language description")
    parser.add_argument("--file", required=True, help="Path to Parquet file")
    parser.add_argument("--query", help="Natural language query (if not provided, will prompt)")
    parser.add_argument("--top-k", type=int, default=5, help="Number of results to return")
    parser.add_argument("--rebuild-cache", action="store_true", help="Force rebuild embedding cache")
    parser.add_argument("--content-column", default="content", help="Column name containing Solidity code")
    parser.add_argument("--batch-size", type=int, default=5, help="Batch size for embedding generation (smaller = more stable)")
    parser.add_argument("--max-length", type=int, default=8192, help="Maximum text length for embedding (default: 8192)")
    parser.add_argument("--use-chunked", action="store_true", help="Use chunked embedding for very long texts (slower but more accurate)")
    parser.add_argument("--provider", choices=["ollama", "openrouter"], default="ollama", help="Embedding service provider")
    parser.add_argument("--model", default=None, help="Embedding model name to use")
    parser.add_argument("--ollama-url", default="http://localhost:11434", help="Ollama base URL")
    parser.add_argument("--router-url", default="https://openrouter.ai/api/v1", help="OpenRouter base URL")
    parser.add_argument("--router-key", default=None, help="OpenRouter API key")

    args = parser.parse_args()

    # Get query if not provided
    query = args.query
    if not query:
        query = input("Enter natural language description: ").strip()
        if not query:
            print("No query provided")
            sys.exit(1)

    try:
        # Initialize embedding client
        if args.model is None:
            args.model = "nomic-embed-text:latest" if args.provider == "ollama" else "baai/bge-m3"

        if args.provider == "ollama":
            embedder = OllamaEmbedder(model_name=args.model, base_url=args.ollama_url)
        else:
            embedder = OpenRouterEmbedder(model_name=args.model, base_url=args.router_url, api_key=args.router_key)

        cache_suffix = f"{args.provider}_{args.model}"
        retriever = SolidityRetriever(args.file, args.content_column, cache_suffix=cache_suffix)

        # Load data and embeddings
        retriever.load_data()
        retriever.load_or_compute_embeddings(embedder, args.rebuild_cache, args.batch_size, args.max_length, args.use_chunked)

        # Generate query embedding
        print(f"Generating embedding for query: '{query}'")
        if args.use_chunked:
            query_emb = embedder.embed_text_chunked(query)
        else:
            query_emb = embedder.embed_text(query, max_length=args.max_length)

        # Search
        print(f"Searching for top {args.top_k} matches...")
        results = retriever.search(query_emb, args.top_k)

        # Display results
        print(f"\nTop {len(results)} results for query: '{query}'\n")
        for i, (idx, sim, content) in enumerate(results, 1):
            print(f"{i}. Similarity: {sim:.4f} (Row {idx})")
            print(f"Code snippet:\n{content[:500]}{'...' if len(content) > 500 else ''}\n")
            print("-" * 80)

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()