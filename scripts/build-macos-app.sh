#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
REPOSITORY_DIR=${SCRIPT_DIR:h}
MACOS_PACKAGE_DIR="$REPOSITORY_DIR/macos"
OUTPUT_DIR="$REPOSITORY_DIR/dist"
OUTPUT_APP="$OUTPUT_DIR/WhatsNew.app"
STAGING_DIR=$(mktemp -d /tmp/whatsnew-app.XXXXXX)
STAGING_APP="$STAGING_DIR/WhatsNew.app"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

swift build --package-path "$MACOS_PACKAGE_DIR" --configuration release
RELEASE_BIN_DIR=$(swift build --package-path "$MACOS_PACKAGE_DIR" --configuration release --show-bin-path)

mkdir -p "$STAGING_APP/Contents/MacOS" "$STAGING_APP/Contents/Resources"
cp "$RELEASE_BIN_DIR/WhatsNewMac" "$STAGING_APP/Contents/MacOS/WhatsNew"
cp "$MACOS_PACKAGE_DIR/Resources/Info.plist" "$STAGING_APP/Contents/Info.plist"
cp "$MACOS_PACKAGE_DIR/Resources/AppIcon.icns" "$STAGING_APP/Contents/Resources/AppIcon.icns"

plutil -insert CFBundleDisplayName -string WhatsNew "$STAGING_APP/Contents/Info.plist"
plutil -insert CFBundleExecutable -string WhatsNew "$STAGING_APP/Contents/Info.plist"
plutil -insert CFBundleIdentifier -string com.zaynzhu.whatsnew "$STAGING_APP/Contents/Info.plist"
plutil -insert CFBundleIconFile -string AppIcon "$STAGING_APP/Contents/Info.plist"
plutil -insert CFBundleInfoDictionaryVersion -string 6.0 "$STAGING_APP/Contents/Info.plist"
plutil -insert CFBundleName -string WhatsNew "$STAGING_APP/Contents/Info.plist"
plutil -insert CFBundlePackageType -string APPL "$STAGING_APP/Contents/Info.plist"
plutil -insert CFBundleShortVersionString -string 1.0.0 "$STAGING_APP/Contents/Info.plist"
plutil -insert CFBundleVersion -string 1 "$STAGING_APP/Contents/Info.plist"
plutil -insert LSApplicationCategoryType -string public.app-category.entertainment "$STAGING_APP/Contents/Info.plist"
plutil -insert LSMinimumSystemVersion -string 14.0 "$STAGING_APP/Contents/Info.plist"
plutil -insert NSHighResolutionCapable -bool true "$STAGING_APP/Contents/Info.plist"

codesign --force --deep --sign - "$STAGING_APP"
codesign --verify --deep --strict "$STAGING_APP"

mkdir -p "$OUTPUT_DIR"
rm -rf "$OUTPUT_APP"
mv "$STAGING_APP" "$OUTPUT_APP"

print "Built $OUTPUT_APP"
