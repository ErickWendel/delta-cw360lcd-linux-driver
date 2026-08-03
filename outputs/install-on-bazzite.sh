#!/usr/bin/env bash
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
archive="$here/delta-center-linux-compat-2.0.11-x64.tar.gz"
install_dir="$HOME/.local/opt/delta-center"
desktop_dir="$HOME/.local/share/applications"
autostart_dir="$HOME/.config/autostart"

test -f "$archive" || { echo "Missing $archive" >&2; exit 1; }
mkdir -p "$install_dir" "$desktop_dir" "$autostart_dir"
rm -rf "$install_dir"/*
tar -xzf "$archive" -C "$install_dir" --strip-components=1
chmod +x "$install_dir/delta-center" "$install_dir/chrome_crashpad_handler" "$install_dir/chrome-sandbox"
cat > "$install_dir/delta-center-launch" <<EOF
#!/usr/bin/env bash
exec "$install_dir/delta-center" --disable-setuid-sandbox "\$@"
EOF
chmod +x "$install_dir/delta-center-launch"

cat > "$desktop_dir/delta-center.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Delta Center (CW360LCD)
Exec=$install_dir/delta-center-launch
Icon=$install_dir/resources/main/app.ico
Terminal=false
Categories=Utility;System;
StartupNotify=true
EOF
chmod 0644 "$desktop_dir/delta-center.desktop"

cat > "$autostart_dir/delta-center.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Delta Center (CW360LCD)
Comment=Start the CW360LCD sensor display after login
Exec=$install_dir/delta-center-launch --hidden
Icon=$install_dir/resources/main/app.ico
Terminal=false
X-GNOME-Autostart-enabled=true
StartupNotify=false
EOF
chmod 0644 "$autostart_dir/delta-center.desktop"

if command -v run0 >/dev/null 2>&1; then
  privileged=(run0)
else
  privileged=(sudo)
fi
echo "Installing the USB permission rule (privilege is used only for /etc/udev/rules.d and udev reload)."
"${privileged[@]}" install -m 0644 "$here/99-delta-cw360lcd.rules" /etc/udev/rules.d/99-delta-cw360lcd.rules
"${privileged[@]}" udevadm control --reload-rules
"${privileged[@]}" udevadm trigger

echo "Installed. Delta Center will start hidden on future desktop logins."
