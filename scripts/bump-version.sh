#!/bin/bash

# Bump version script for nuts-cash
# Usage: ./scripts/bump-version.sh [patch|minor|major] [--push]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
BUMP_TYPE=${1:-patch}
PUSH=false

if [[ "$2" == "--push" ]]; then
    PUSH=true
fi

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: Invalid bump type. Use 'patch', 'minor', or 'major'${NC}"
    echo "Usage: ./scripts/bump-version.sh [patch|minor|major] [--push]"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version: $CURRENT_VERSION${NC}"

# Calculate new version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case $BUMP_TYPE in
    major)
        NEW_MAJOR=$((MAJOR + 1))
        NEW_VERSION="${NEW_MAJOR}.0.0"
        ;;
    minor)
        NEW_MINOR=$((MINOR + 1))
        NEW_VERSION="${MAJOR}.${NEW_MINOR}.0"
        ;;
    patch)
        NEW_PATCH=$((PATCH + 1))
        NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"
        ;;
esac

echo -e "${YELLOW}New version: $NEW_VERSION${NC}"

# Check if working directory is clean
if ! git diff --quiet HEAD; then
    echo -e "${RED}Error: Working directory has uncommitted changes${NC}"
    echo "Please commit or stash your changes before bumping version"
    exit 1
fi
# Update package.json
npm version $NEW_VERSION --no-git-tag-version --allow-same-version

echo -e "${GREEN}✓ Updated package.json to version $NEW_VERSION${NC}"

# Create git commit and tag
git add package.json package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo -e "${GREEN}✓ Created git commit and tag v$NEW_VERSION${NC}"

# Push if requested
if [ "$PUSH" = true ]; then
    echo -e "${YELLOW}Pushing to remote...${NC}"
    git push origin HEAD
    git push origin "v$NEW_VERSION"
    echo -e "${GREEN}✓ Pushed commit and tag to remote${NC}"
else
    echo ""
    echo -e "${YELLOW}To push the changes and trigger a build, run:${NC}"
    echo "  git push origin HEAD"
    echo "  git push origin v$NEW_VERSION"
    echo ""
    echo -e "${YELLOW}Or run this script with --push:${NC}"
    echo "  ./scripts/bump-version.sh $BUMP_TYPE --push"
fi

echo ""
echo -e "${GREEN}Version bump complete!${NC}"
echo "New version: $NEW_VERSION"
