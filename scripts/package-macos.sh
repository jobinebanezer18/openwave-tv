#!/bin/bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
output_dir="${1:-$(cd "$repo_dir/.." && pwd)}"
version="$(cd "$repo_dir" && node -p "require('./package.json').version")"
bundle_version="${version%%-*}"
bundle_build="$(node -e 'const v=process.argv[1].match(/^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/);if(!v||Number(v[4]||0)>998)process.exit(1);console.log(Number(v[1])*1000000000+Number(v[2])*1000000+Number(v[3])*1000+(v[4]?Number(v[4]):999))' "$version")"
build_dir="$repo_dir/work/macos-package"
stage_dir="$build_dir/dmg-stage"
app_dir="$stage_dir/OpenWave TV.app"
dmg_path="$output_dir/OpenWave-TV-${version}-macOS-universal-unsigned.dmg"
icon_source="$repo_dir/public/icons/icon-512.png"

mkdir -p "$output_dir"
rm -rf "$build_dir"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources" "$app_dir/Contents/Frameworks" "$stage_dir"

sparkle_version="2.10.0"
sparkle_sha256="c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c"
sparkle_cache="$repo_dir/work/vendor-cache/Sparkle-$sparkle_version.tar.xz"
mkdir -p "$(dirname "$sparkle_cache")" "$build_dir/sparkle"
if [[ ! -f "$sparkle_cache" ]]; then
  curl -fLsS --retry 3 "https://github.com/sparkle-project/Sparkle/releases/download/$sparkle_version/Sparkle-$sparkle_version.tar.xz" -o "$sparkle_cache"
fi
printf '%s  %s\n' "$sparkle_sha256" "$sparkle_cache" | shasum -a 256 -c -
tar -xf "$sparkle_cache" -C "$build_dir/sparkle" ./Sparkle.framework ./LICENSE
ditto "$build_dir/sparkle/Sparkle.framework" "$app_dir/Contents/Frameworks/Sparkle.framework"
cp "$build_dir/sparkle/LICENSE" "$app_dir/Contents/Resources/Sparkle-LICENSE"

cd "$repo_dir"
npm run build
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w -X main.buildVersion=$version" -o "$build_dir/openwave-arm64" .
CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -trimpath -ldflags="-s -w -X main.buildVersion=$version" -o "$build_dir/openwave-amd64" .
lipo -create "$build_dir/openwave-arm64" "$build_dir/openwave-amd64" -output "$app_dir/Contents/Resources/openwave-server"
chmod 755 "$app_dir/Contents/Resources/openwave-server"
sdk_path="$(xcrun --show-sdk-path)"
swiftc -parse-as-library -swift-version 5 -O -sdk "$sdk_path" -target arm64-apple-macos12.0 -F "$build_dir/sparkle" -framework AppKit -framework WebKit -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks "$repo_dir/scripts/OpenWaveApp.swift" -o "$build_dir/launcher-arm64"
swiftc -parse-as-library -swift-version 5 -O -sdk "$sdk_path" -target x86_64-apple-macos12.0 -F "$build_dir/sparkle" -framework AppKit -framework WebKit -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks "$repo_dir/scripts/OpenWaveApp.swift" -o "$build_dir/launcher-amd64"
lipo -create "$build_dir/launcher-arm64" "$build_dir/launcher-amd64" -output "$app_dir/Contents/MacOS/OpenWave TV"
chmod 755 "$app_dir/Contents/MacOS/OpenWave TV"
unlink "$build_dir/openwave-arm64"
unlink "$build_dir/openwave-amd64"
unlink "$build_dir/launcher-arm64"
unlink "$build_dir/launcher-amd64"

cat > "$app_dir/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>io.github.jobinebanezer18.openwavetv</string>
  <key>CFBundleName</key><string>OpenWave TV</string>
  <key>CFBundleDisplayName</key><string>OpenWave TV</string>
  <key>CFBundleExecutable</key><string>OpenWave TV</string>
  <key>CFBundleIconFile</key><string>OpenWave.icns</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$bundle_version</string>
  <key>CFBundleVersion</key><string>$bundle_build</string>
  <key>OpenWaveBuildVersion</key><string>$version</string>
  <key>SUFeedURL</key><string>https://tv.vibeworks.in/updates/macos.xml</string>
  <key>SUPublicEDKey</key><string>7/nbasA9NePe1/dgd+fn2EnNnnSTL3XyCm/Rq8Qtco8=</string>
  <key>SUEnableAutomaticChecks</key><true/>
  <key>SUAutomaticallyUpdate</key><true/>
  <key>SURequireSignedFeed</key><true/>
  <key>SUVerifyUpdateBeforeExtraction</key><true/>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

iconset="$build_dir/OpenWave.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -s format png -z "$size" "$size" "$icon_source" --out "$iconset/icon_${size}x${size}.png" >/dev/null
done
for size in 16 32 128 256 512; do
  doubled=$((size * 2))
  sips -s format png -z "$doubled" "$doubled" "$icon_source" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app_dir/Contents/Resources/OpenWave.icns"
plutil -lint "$app_dir/Contents/Info.plist"
codesign --force --sign - --timestamp=none "$app_dir/Contents/Resources/openwave-server"
codesign --force --sign - --timestamp=none "$app_dir/Contents/MacOS/OpenWave TV"
codesign --force --sign - --timestamp=none "$app_dir"
codesign --verify --deep --strict "$app_dir"

ln -s /Applications "$stage_dir/Applications"
cat > "$stage_dir/READ ME FIRST.txt" <<'NOTE'
Drag OpenWave TV.app to Applications, then open it. Its window starts the
local TV server and shows the guide. Use Quit app in the guide to stop it.

This preview is ad-hoc signed, not Apple Developer ID signed or notarized.
macOS may ask you to use Control-click > Open the first time.
NOTE

hdiutil create -volname "OpenWave TV" -srcfolder "$stage_dir" -ov -fs HFS+ -format UDZO "$dmg_path" >/dev/null
hdiutil verify "$dmg_path" >/dev/null
(cd "$output_dir" && shasum -a 256 "$(basename "$dmg_path")" > "$(basename "$dmg_path").sha256")
printf 'Created %s\n' "$dmg_path"
lipo -archs "$app_dir/Contents/Resources/openwave-server"
