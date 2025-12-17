#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}


# Function to update npm package version
update_npm_version() {
    local component=$1
    print_info "Updating $component version..."
    cd "src/$component"
    npm version "$VERSION" --no-git-tag-version
    cd -
}

# Function to update Python project version in pyproject.toml
update_python_version() {
    local component=$1
    print_info "Updating $component version..."
    cd "src/$component"

    if [ ! -f "pyproject.toml" ]; then
        print_error "pyproject.toml not found in src/$component!"
        exit 1
    fi

    if grep -q '^version = "' pyproject.toml; then
        sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" pyproject.toml
        rm pyproject.toml.bak
        print_info "Updated pyproject.toml version to $VERSION"
    else
        print_error "Could not find version line in pyproject.toml"
        exit 1
    fi

    cd -
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not a git repository. Please run this script from the root of your project."
    exit 1
fi

# Check if working directory is clean
if ! git diff-index --quiet HEAD --; then
    print_error "Working directory is not clean. Please commit or stash your changes first."
    exit 1
fi

# Ask user for release version number
echo ""
read -p "Enter release version number (e.g., 1.2.3): " VERSION

# Validate version format (basic semver check)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Invalid version format. Please use semantic versioning (e.g., 1.2.3)"
    exit 1
fi

print_info "Release version: $VERSION"

# Check if branch already exists
BRANCH_NAME="release/$VERSION"
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    print_error "Branch $BRANCH_NAME already exists!"
    exit 1
fi

# Create and checkout new branch
print_info "Creating branch: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"

# Update frontend
update_npm_version "frontend"

# Update SDK
update_npm_version "sdk"

# Update mail
update_npm_version "mail"

# Update backend pyproject.toml
update_python_version "backend"

# Update summary pyproject.toml
update_python_version "summary"

# Update agents pyproject.toml
update_python_version "agents"

# Update CHANGELOG
print_info "Updating CHANGELOG..."

if [ ! -f "CHANGELOG.md" ]; then
    print_error "CHANGELOG.md not found in project root!"
    exit 1
fi

# Get current date in YYYY-MM-DD format
CURRENT_DATE=$(date +%Y-%m-%d)

# Replace [Unreleased] with [version number] - YYYY-MM-DD
if grep -q '\[Unreleased\]' CHANGELOG.md; then
    sed -i.bak "s/\[Unreleased\]/[$VERSION] - $CURRENT_DATE/" CHANGELOG.md

    # Add new [Unreleased] section after the header
    # This adds it after the line containing "Semantic Versioning"
    sed -i.bak "/Semantic Versioning/a\\
\\
## [Unreleased]
" CHANGELOG.md

    rm CHANGELOG.md.bak
    print_info "Updated CHANGELOG.md"
else
    print_warning "Could not find [Unreleased] section in CHANGELOG.md"
fi



# Summary
echo ""
print_info "Release preparation complete!"
echo ""
echo "Summary:"
echo "  - Branch created: $BRANCH_NAME"
echo "  - Version updated to: $VERSION"
echo "  - Files modified:"
echo "      - src/frontend/package.json"
echo "      - src/sdk/package.json"
echo "      - src/mail/package.json"
echo "      - src/backend/pyproject.toml"
echo "      - src/summary/pyproject.toml"
echo "      - src/agents/pyproject.toml"
echo "      - CHANGELOG.md"
echo ""
print_warning "Next steps:"
echo "  1. Review the changes: git status"
echo "  2. Commit the changes: git add . && git commit -m 'Release $VERSION'"
echo "  3. Push the branch: git push origin $BRANCH_NAME"
echo ""