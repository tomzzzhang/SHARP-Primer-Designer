#!/usr/bin/env bash
# SHARP Primer Designer — first-time setup
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
CONDA_ENV_NAME="sharp"

echo "=== SHARP Primer Designer Setup ==="
echo ""

# ── BLAST+ ────────────────────────────────────────────────────────────────────
# Required for specificity screening. Auto-install if missing.

echo "Checking BLAST+..."
BLAST_AVAILABLE=0
BLASTN=""

# Search common locations (backend also does this at runtime)
for dir in "" "/usr/local/bin/" "/opt/homebrew/bin/" "/usr/bin/"; do
    if [ -x "${dir}blastn" ]; then
        BLASTN="${dir}blastn"
        break
    fi
done

if [ -n "$BLASTN" ]; then
    BLAST_AVAILABLE=1
    "$BLASTN" -version | head -1
else
    echo "BLAST+ not found — attempting to install..."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &>/dev/null; then
            echo "  Installing via Homebrew..."
            brew install blast 2>&1 | tail -3
        else
            echo "  Homebrew not found. Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            brew install blast 2>&1 | tail -3
        fi
    elif command -v apt-get &>/dev/null; then
        # Debian / Ubuntu
        echo "  Installing via apt (may require sudo password)..."
        sudo apt-get update -qq && sudo apt-get install -y -qq ncbi-blast+
    elif command -v dnf &>/dev/null; then
        # Fedora / RHEL
        echo "  Installing via dnf (may require sudo password)..."
        sudo dnf install -y -q blast+
    elif command -v yum &>/dev/null; then
        # Older RHEL / CentOS
        echo "  Installing via yum (may require sudo password)..."
        sudo yum install -y -q blast+
    else
        echo "  Could not auto-install BLAST+. Please install manually:"
        echo "    https://ftp.ncbi.nlm.nih.gov/blast/executables/blast+/LATEST/"
    fi

    # Re-check after install
    for dir in "" "/usr/local/bin/" "/opt/homebrew/bin/" "/usr/bin/"; do
        if [ -x "${dir}blastn" ]; then
            BLASTN="${dir}blastn"
            break
        fi
    done

    if [ -n "$BLASTN" ]; then
        BLAST_AVAILABLE=1
        echo "  BLAST+ installed successfully:"
        "$BLASTN" -version | head -1
    else
        echo "  WARNING: BLAST+ installation failed. Specificity screening will be unavailable."
        echo "  You can install it later and restart the app."
    fi
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
        openpyxl \
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

# Reference genomes (Lambda + E. coli K-12)
if [ "$BLAST_AVAILABLE" -eq 1 ]; then
    echo "Setting up reference genomes for BLAST screening..."
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
