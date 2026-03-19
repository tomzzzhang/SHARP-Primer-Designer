#!/bin/bash
# Double-click this file on macOS to launch SHARP Primer Designer
cd "$(dirname "$0")"

# Find Python from conda env
CONDA_BASE="$(conda info --base 2>/dev/null)"
if [ -z "$CONDA_BASE" ]; then
    # Check common locations
    for candidate in "$HOME/opt/anaconda3" "$HOME/anaconda3" "$HOME/miniconda3"; do
        if [ -d "$candidate/envs" ]; then
            CONDA_BASE="$candidate"
            break
        fi
    done
fi

PYTHON="$CONDA_BASE/envs/sharp/bin/pythonw"
if [ ! -f "$PYTHON" ]; then
    PYTHON="$CONDA_BASE/envs/sharp/bin/python"
fi

if [ ! -f "$PYTHON" ]; then
    echo "Could not find Python in conda env 'sharp'."
    echo "Run ./scripts/setup.sh first."
    read -p "Press Enter to close..."
    exit 1
fi

"$PYTHON" launcher.py
