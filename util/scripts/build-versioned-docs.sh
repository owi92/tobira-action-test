#!/bin/bash

# This script copies old docs from git tags into the corresponding
# 'versioned_docs/version-vx.y' directory and creates a 'versions.json' so that
# Docusaurus builds versioned docs.
#
# This does everything manually instead of using the docuraurus command as it's
# not a lot of work, the docusaurus command is super slow, and because
# otherwise, this script would require 'npm ci' to run first.

basedir=$(dirname "$0")
cd "$basedir/../../docs" || exit 1


SIDEBAR_FILE=$(cat << EOM
{
  "defaultSidebar": [
    {
      "type": "autogenerated",
      "dirName": "."
    }
  ]
}
EOM
)


# Create a temporary worktree for us to checkout other tags without changing the
# main worktree.
TMP_REPO=$(mktemp -d)
git worktree add --quiet --detach "$TMP_REPO"

# Initial directory and files
mkdir -p versioned_docs
mkdir -p versioned_sidebars
echo "[" >> versions.json

# For each version in 'versions.txt'
while read -r version; do
    # Checkout and copy docs
    git -C "$TMP_REPO" switch --quiet --detach "$version"
    cp -r "$TMP_REPO/docs/docs" "versioned_docs/version-$version"

    # Add entry to version.jsons
    echo "    \"$version\"," >> versions.json

    # Add versioned sidebar
    echo "$SIDEBAR_FILE" > "versioned_sidebars/version-$version-sidebars.json"

    echo "Copied docs for $version"
done <versions.txt

# Remove trailing comma (stupid JSON, grumble grumble) and close array.
sed -i '$ s/.$//' versions.json
echo "]" >> versions.json

rm -rf "$TMP_REPO"

echo "Done setting up versioned docs!"
