#!/usr/bin/env bash
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
archive="$here/delta-center-linux-compat-2.0.11-x64.tar.gz"
install_dir="$HOME/.local/opt/delta-center"
desktop_dir="$HOME/.local/share/applications"

test -f "$archive" || { echo "Missing $archive" >&2; exit 1; }
mkdir -p "$install_dir" "$desktop_dir"
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
Terminal=false
Categories=Utility;System;
StartupNotify=true
EOF
chmod 0644 "$desktop_dir/delta-center.desktop"

echo "Installing the USB permission rule (sudo is used only for /etc/udev/rules.d)."
sudo install -m 0644 "$here/99-delta-cw360lcd.rules" /etc/udev/rules.d/99-delta-cw360lcd.rules
sudo udevadm control --reload-rules
sudo udevadm trigger

echo "Installed. Unplug/replug the cooler, then launch 'Delta Center (CW360LCD)' from the app menu."
