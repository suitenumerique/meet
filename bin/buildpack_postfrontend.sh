#!/bin/bash

set -o errexit    # always exit on error
set -o pipefail   # don't ignore exit codes when piping output

echo "-----> Running post-frontend script"

# Move the frontend build to the nginx root and clean up
mkdir -p build/
mv src/frontend/dist build/frontend-out

mv src/backend/* ./
mv deploy/paas/* ./

echo "3.13" > .python-version
echo "." > requirements.txt
