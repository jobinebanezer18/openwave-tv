#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
tag="${1:?usage: deploy-update-feed.sh vX.Y.Z-beta.N}"
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+$ ]] || { echo "Invalid beta release tag" >&2; exit 1; }

cd "$repo_dir"
feed_dir="$repo_dir/work/update-feed/$tag"
mkdir -p "$feed_dir"
gh release download "$tag" --pattern macos.xml --dir "$feed_dir" --clobber
rg -q '<!-- sparkle-signatures:' "$feed_dir/macos.xml"
rg -q "releases/download/$tag/" "$feed_dir/macos.xml"

npm run build:web
mkdir -p dist-web/updates
cp "$feed_dir/macos.xml" dist-web/updates/macos.xml
npx --yes wrangler whoami >/dev/null
npx --yes wrangler pages deploy dist-web --project-name=openwave-world-beta --branch=main
for attempt in {1..10}; do
  if curl -fsS "https://openwave-world-beta.pages.dev/updates/macos.xml" -o "$feed_dir/deployed.xml" &&
     cmp -s "$feed_dir/macos.xml" "$feed_dir/deployed.xml" &&
     curl -fsS "https://tv.vibeworks.in/updates/macos.xml" -o "$feed_dir/custom-domain.xml" &&
     cmp -s "$feed_dir/macos.xml" "$feed_dir/custom-domain.xml"; then
    echo "Published signed update feed for $tag"
    exit 0
  fi
  sleep 2
done
echo "Pages did not serve the new update feed" >&2
exit 1
