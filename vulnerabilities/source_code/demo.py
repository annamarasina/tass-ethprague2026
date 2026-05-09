#!/usr/bin/env python3
"""
Demo script showing how to use the Solidity code retrieval system.
This demonstrates the basic functionality without requiring Ollama.
"""

import os
import sys
import pyarrow.parquet as pq

def demo_parquet_reading():
    """Demonstrate reading Solidity code from Parquet file."""
    print("=== Parquet File Reading Demo ===\n")

    parquet_path = "../dataset/sources_10000_20000.parquet"

    if not os.path.exists(parquet_path):
        print(f"❌ Parquet file not found: {parquet_path}")
        return

    try:
        # Read the Parquet file
        pqf = pq.ParquetFile(parquet_path)
        print(f"📊 File contains {pqf.metadata.num_rows} rows")
        print(f"📋 Columns: {pqf.schema.names}")

        # Read first 5 rows of content
        table = pq.read_table(parquet_path, columns=['content'])
        contents = table['content'].to_pylist()[:5]

        print("\n📝 Sample Solidity code snippets:")
        print("-" * 50)
        for i, content in enumerate(contents, 1):
            print(f"\n{i}. Row {i-1}:")
            # Show first 200 characters of each code snippet
            preview = content[:200] + "..." if len(content) > 200 else content
            print(preview)
            print("-" * 30)

    except Exception as e:
        print(f"❌ Error reading Parquet file: {e}")

def demo_workflow():
    """Show the complete workflow."""
    print("\n=== Complete Workflow Demo ===\n")

    steps = [
        "1. 📖 Load Solidity code from Parquet file",
        "2. 🧠 Generate embeddings using Ollama nomic-embed-text",
        "3. 💾 Cache embeddings for faster future queries",
        "4. 🔍 Convert natural language query to embedding",
        "5. 📏 Calculate cosine similarity between query and code embeddings",
        "6. 🏆 Return top-K most similar Solidity code snippets"
    ]

    for step in steps:
        print(step)

    print("\n💡 Usage example:")
    print("python find_solidity_by_nl.py --file ../dataset/sources_10000_20000.parquet --query 'ERC20 transfer function' --top-k 3")

def demo_requirements():
    """Show system requirements."""
    print("\n=== System Requirements ===\n")

    requirements = {
        "Python packages": ["pyarrow", "numpy", "requests", "scipy"],
        "Ollama setup": ["ollama serve", "ollama pull nomic-embed-text"],
        "Data": ["sources_10000_20000.parquet in ../dataset/"]
    }

    for category, items in requirements.items():
        print(f"📦 {category}:")
        for item in items:
            print(f"   • {item}")
        print()

def main():
    print("🎯 Solidity Code Retrieval Demo")
    print("=" * 40)

    demo_parquet_reading()
    demo_workflow()
    demo_requirements()

    print("🚀 To run the full system:")
    print("1. Install Ollama and pull the model:")
    print("   ollama pull nomic-embed-text")
    print("2. Start Ollama service:")
    print("   ollama serve")
    print("3. Run the main script:")
    print("   python find_solidity_by_nl.py --file ../dataset/sources_10000_20000.parquet --query 'your description here'")

if __name__ == "__main__":
    main()