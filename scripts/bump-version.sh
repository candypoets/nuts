#!/bin/bash

# Bump version script for nuts-cash
# Usage: ./scripts/bump-version.sh [patch|minor|major] [--push] [--notes]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
BUMP_TYPE=${1:-patch}
PUSH=false
CREATE_NOTES=false

for arg in "$@"; do
    case $arg in
        --push)
            PUSH=true
            ;;
        --notes)
            CREATE_NOTES=true
            ;;
    esac
done

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: Invalid bump type. Use 'patch', 'minor', or 'major'${NC}"
    echo "Usage: ./scripts/bump-version.sh [patch|minor|major] [--push] [--notes]"
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

# Generate release notes if requested
RELEASE_NOTES=""
if [ "$CREATE_NOTES" = true ]; then
    echo -e "${BLUE}Generating release notes...${NC}"
    
    # Get the last tag
    LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    
    if [ -n "$LAST_TAG" ]; then
        # Generate changelog from commits
        TEMP_FILE=$(mktemp)
        
        echo "## What's Changed" > "$TEMP_FILE"
        echo "" >> "$TEMP_FILE"
        
        # Get commits since last tag, formatted nicely
        git log "$LAST_TAG"..HEAD --pretty=format:"- %s (%h)" --no-merges >> "$TEMP_FILE" 2>/dev/null || true
        
        echo "" >> "$TEMP_FILE"
        echo "" >> "$TEMP_FILE"
        echo "**Full Changelog**: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:\/]//;s/.git$//')/compare/$LAST_TAG...v$NEW_VERSION" >> "$TEMP_FILE"
        
        # Open in editor for user to edit
        ${EDITOR:-nano} "$TEMP_FILE"
        
        RELEASE_NOTES=$(cat "$TEMP_FILE")
        rm "$TEMP_FILE"
        
        echo -e "${GREEN}✓ Release notes prepared${NC}"
    else
        echo -e "${YELLOW}No previous tag found, skipping auto-generated notes${NC}"
        RELEASE_NOTES="Release v$NEW_VERSION"
    fi
fi

# Update package.json
npm version $NEW_VERSION --no-git-tag-version --allow-same-version

echo -e "${GREEN}✓ Updated package.json to version $NEW_VERSION${NC}"

# Create git commit
git add package.json package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"

# Create tag (with release notes if available)
if [ -n "$RELEASE_NOTES" ]; then
    echo "$RELEASE_NOTES" | git tag -a "v$NEW_VERSION" -F -
else
    git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
fi

echo -e "${GREEN}✓ Created git commit and tag v$NEW_VERSION${NC}"

# Create GitHub release if requested and gh CLI is available
if [ "$CREATE_NOTES" = true ] && command -v gh &> /dev/null; then
    echo -e "${BLUE}Creating GitHub release...${NC}"
    
    if [ "$PUSH" = true ]; then
        # Push first so the release can reference the tag
        git push origin "v$NEW_VERSION"
        gh release create "v$NEW_VERSION" --title "v$NEW_VERSION" --notes "$RELEASE_NOTES"
        echo -e "${GREEN}✓ Created GitHub release${NC}"
    else
        echo -e "${YELLOW}Release notes prepared. To create GitHub release after push:${NC}"
        echo "  gh release create v$NEW_VERSION --title \"v$NEW_VERSION\" --notes-file - <<< '$RELEASE_NOTES'"
    fi
elif [ "$CREATE_NOTES" = true ]; then
    echo -e "${YELLOW}gh CLI not found. Install it to auto-create GitHub releases.${NC}"
    echo "  https://cli.github.com/"
fi

# Push if requested
if [ "$PUSH" = true ]; then
    echo -e "${YELLOW}Pushing to remote...${NC}"
    git push origin HEAD
    if [ "$CREATE_NOTES" = false ]; then
        git push origin "v$NEW_VERSION"
    fi
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

if [ "$CREATE_NOTES" = true ]; then
    echo ""
    echo -e "${BLUE}Release Notes Preview:${NC}"
    echo "---"
    echo "$RELEASE_NOTES"
    echo "---"
fi
