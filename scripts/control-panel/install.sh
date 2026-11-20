#!/bin/zsh
set -eu
HERE=${0:A:h}
APP="$HOME/Applications/GMS Hub Control.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -parse-as-library "$HERE/ControlPanel.swift" -o "$APP/Contents/MacOS/GMSHubControl" -framework SwiftUI -framework AppKit
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>GMSHubControl</string>
<key>CFBundleIdentifier</key><string>com.gmshub.control</string>
<key>CFBundleName</key><string>GMS Hub Control</string>
<key>CFBundleDisplayName</key><string>GMS Hub Control</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --sign - "$APP"
open "$APP"
