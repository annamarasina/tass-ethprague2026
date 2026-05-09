#!/usr/bin/env python3
"""
Test script to verify the Solidity code retrieval system.
"""

import sys
import os

def test_imports():
    """Test if all required packages can be imported."""
    try:
        import pyarrow.parquet as pq
        import numpy as np
        import requests
        from scipy.spatial.distance import cosine
        print("✓ All Python packages imported successfully")
        return True
    except ImportError as e:
        print(f"✗ Import error: {e}")
        return False

def test_ollama_connection():
    """Test connection to Ollama service."""
    try:
        import requests
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get("models", [])
            model_names = [m.get("name") for m in models]
            if "nomic-embed-text" in model_names:
                print("✓ Ollama connected and nomic-embed-text model available")
                return True
            else:
                print("✗ nomic-embed-text model not found. Run: ollama pull nomic-embed-text")
                return False
        else:
            print(f"✗ Ollama API returned status {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ Cannot connect to Ollama: {e}")
        print("  Make sure Ollama is running: ollama serve")
        return False

def test_parquet_access():
    """Test if we can access the Parquet file."""
    parquet_path = "../dataset/sources_10000_20000.parquet"
    if not os.path.exists(parquet_path):
        print(f"✗ Parquet file not found: {parquet_path}")
        return False

    try:
        import pyarrow.parquet as pq
        pqf = pq.ParquetFile(parquet_path)
        print(f"✓ Parquet file accessible: {pqf.metadata.num_rows} rows")
        if "content" in pqf.schema.names:
            print("✓ 'content' column found in Parquet file")
            return True
        else:
            print(f"✗ 'content' column not found. Available columns: {pqf.schema.names}")
            return False
    except Exception as e:
        print(f"✗ Error reading Parquet file: {e}")
        return False

def main():
    print("Testing Solidity Code Retrieval System\n")

    tests = [
        ("Python imports", test_imports),
        ("Ollama connection", test_ollama_connection),
        ("Parquet file access", test_parquet_access),
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        print(f"Testing {test_name}...")
        if test_func():
            passed += 1
        print()

    print(f"Results: {passed}/{total} tests passed")

    if passed == total:
        print("🎉 All tests passed! You can now run the main script.")
        print("Example: python find_solidity_by_nl.py --file ../sources_10000_20000.parquet --query 'ERC20 transfer'")
    else:
        print("❌ Some tests failed. Please fix the issues above before running the main script.")
        sys.exit(1)

if __name__ == "__main__":
    main()