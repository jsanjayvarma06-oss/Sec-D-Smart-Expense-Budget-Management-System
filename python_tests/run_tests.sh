#!/bin/bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$DIR/../.venv/bin/activate" ]; then
    source "$DIR/../.venv/bin/activate"
elif [ -f "$DIR/../../.venv/bin/activate" ]; then
    source "$DIR/../../.venv/bin/activate"
elif [ -f "$DIR/.venv/bin/activate" ]; then
    source "$DIR/.venv/bin/activate"
fi

cd "$DIR"
pytest --cov=src/smart_expense --cov-branch --cov-report=term-missing --cov-report=html:htmlcov "$@"
