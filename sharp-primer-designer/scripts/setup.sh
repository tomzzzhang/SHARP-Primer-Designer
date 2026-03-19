#!/usr/bin/env bash
# SHARP Primer Designer — first-time setup
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
CONDA_ENV_NAME="sharp"

echo "=== SHARP Primer Designer Setup ==="
echo ""

# Check BLAST+
echo "Checking BLAST+..."
BLAST_AVAILABLE=0
if command -v blastn &>/dev/null; then
    BLAST_AVAILABLE=1
    blastn -version | head -1
else
    echo "WARNING: BLAST+ not found. Specificity screening will be unavailable."
    echo "  macOS: brew install blast"
    echo "  Ubuntu: sudo apt install ncbi-blast+"
    echo "  You can install it later and restart the app."
fi
echo ""

# ── Python environment ────────────────────────────────────────────────────────
# Use conda if available (avoids compiler issues with arm64 + old CLT)
# Falls back to venv otherwise.

if command -v conda &>/dev/null; then
    echo "Conda detected — using conda environment '$CONDA_ENV_NAME'"

    # Initialise conda for this shell session
    CONDA_BASE="$(conda info --base)"
    source "$CONDA_BASE/etc/profile.d/conda.sh"

    if conda env list | grep -qE "^${CONDA_ENV_NAME}\s"; then
        echo "Conda env '$CONDA_ENV_NAME' already exists"
    else
        echo "Creating conda env '$CONDA_ENV_NAME' (Python 3.11)..."
        conda create -y -n "$CONDA_ENV_NAME" python=3.11 -q
    fi

    conda activate "$CONDA_ENV_NAME"

    echo "Installing packages via conda (bioconda has prebuilt arm64 wheels)..."
    conda install -y -q -c bioconda -c conda-forge \
        primer3-py \
        biopython \
        fastapi \
        uvicorn \
        python-multipart \
        python-dotenv \
        pydantic \
        pytest \
        httpx \
        pip

    # Mark that we used conda so start.sh knows
    echo "conda" > "$ROOT/.python_env_type"
    echo "$CONDA_ENV_NAME" >> "$ROOT/.python_env_type"

    PYTHON_CMD="python"
    echo "Python dependencies installed via conda"

else
    echo "Setting up Python venv..."
    cd "$ROOT/backend"
    if [ ! -d "venv" ]; then
        python3 -m venv venv
        echo "Created virtualenv"
    fi
    source venv/bin/activate
    pip install -q -r requirements.txt

    echo "venv" > "$ROOT/.python_env_type"
    PYTHON_CMD="python"
    echo "Python dependencies installed via pip"
fi
echo ""

# .env
if [ ! -f "$ROOT/.env" ]; then
    echo "NCBI_EMAIL=support@sharpdx.com" > "$ROOT/.env"
    echo "Created .env (update NCBI_EMAIL if needed)"
fi

# Lambda BLAST DB
if [ "$BLAST_AVAILABLE" -eq 1 ]; then
    echo "Setting up Lambda phage BLAST database..."
    cd "$ROOT/backend"
    $PYTHON_CMD -m scripts.setup_genomes
else
    echo "Skipping BLAST database setup (BLAST+ not installed)"
fi
echo ""

# Frontend
echo "Setting up frontend..."
cd "$ROOT/frontend"
npm install --silent
echo "Node.js dependencies installed"
echo ""

echo "=== Setup complete ==="
echo ""
echo "To start the app:  ./scripts/start.sh"
