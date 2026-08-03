# Delta CW360LCD Linux compatibility driver

This project runs the Windows-only Delta Center 2.0.11 application on Linux and
adds Linux hardware sensors, USB serial discovery, user media support, desktop
integration, and automatic startup. It has been tested on Bazzite with the
HONGTAI/Delta CW360LCD controller `33c3:7791` (`TXW818-ST7796-3.5inch-hor`,
480×320, firmware 3.2).

The repository does **not** contain Delta Center itself. Delta's compiled UI,
themes, artwork, and native modules remain proprietary and must be imported from
a copy you obtained from the hardware vendor. Do not publish the generated
runtime archive.

## What works

- Delta USB serial discovery and live JPEG streaming at 2,000,000 baud.
- CPU, memory, storage, network, temperature, and optional NVIDIA sensor data.
- The stock Delta theme editor and bundled themes.
- User-uploaded JPEG, PNG, GIF, and video media.
- Animated GIF backgrounds with editable sensor overlays.
- Application-menu launcher and hidden startup after desktop login.
- Bazzite-friendly USB permissions for Delta PIDs `7788`, `7791`, and `7792`.

## Requirements

- x86-64 Linux with a graphical desktop session.
- Node.js 24 and npm.
- `ffmpeg` and `ffprobe` on `PATH` for video metadata and conversion.
- Optional `lm_sensors` (`sensors -j`) and `nvidia-smi` for extra sensor data.
- A Delta Center 2.0.11 installation directory containing:

```text
resources/app.asar
resources/main/
```

The importer intentionally rejects other Delta Center versions because its
patch targets may no longer be safe or correct.

## Build from a vendor installation

Install this repository's development dependencies:

```bash
npm install --ignore-scripts --no-package-lock
```

Import and patch Delta Center. Pass the directory that directly contains its
`resources` folder:

```bash
npm run import -- "/path/to/DELTA CENTRO"
```

On Windows, omitting the path uses `C:\Program Files\DELTA CENTRO`. The imported
files are written under the ignored `work/` directory.

Assemble the Linux runtime:

```bash
npm run assemble:linux
```

The result is `outputs/linux-unpacked/`. The assembler downloads Electron
37.9.0 when a local runtime is not already available.

Run the automated protocol check:

```bash
npm test
```

To create the private installer archive used by the included Bazzite installer:

```bash
tar -czf outputs/delta-center-linux-compat-2.0.11-x64.tar.gz \
  -C outputs linux-unpacked
sha256sum outputs/delta-center-linux-compat-2.0.11-x64.tar.gz
```

Update `outputs/SHA256SUMS.txt` after rebuilding the archive. The archive is
ignored by Git and must be transferred privately along with the installer.

## Install on Bazzite

Keep these files together:

```text
outputs/delta-center-linux-compat-2.0.11-x64.tar.gz
outputs/install-on-bazzite.sh
outputs/99-delta-cw360lcd.rules
```

Then run:

```bash
chmod +x outputs/install-on-bazzite.sh
outputs/install-on-bazzite.sh
```

The installer places the app in `~/.local/opt/delta-center`, creates **Delta
Center (CW360LCD)** in the application launcher, installs the USB permission
rule, and creates `~/.config/autostart/delta-center.desktop`. On future desktop
logins the app starts with `--hidden`, reconnects to the cooler, and resumes the
saved live theme without requiring a manual launch.

Unplug and reconnect the cooler after the first installation. Do not run Delta
Center as root.

## Run and use the app

Open **Delta Center (CW360LCD)** from the application launcher, or run:

```bash
~/.local/opt/delta-center/delta-center-launch
```

Configuration, imported media, previews, and edited themes are stored in:

```text
~/.config/DELTA_CENTRO/
```

To create a GIF-only theme, upload a GIF in Delta Center and choose it as the
theme background without adding widgets. For a sensor theme, open an existing
theme in the editor, replace its background, and keep or modify its data,
progress, and text widgets. A 480×320 theme matches the tested 3.5-inch panel;
square media is cropped to the configured background region.

The current theme ID and device settings persist in
`~/.config/DELTA_CENTRO/config.json`. User themes remain editable and survive
application and PC restarts.

## Device and protocol diagnostics

Confirm that Linux sees the tested controller:

```bash
lsusb -d 33c3:7791
ls -l /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
```

Probe device information with the read-only `0x06` command while Delta Center
is closed:

```bash
ELECTRON_RUN_AS_NODE=1 outputs/linux-unpacked/delta-center \
  scripts/probe-device.cjs /dev/ttyACM1
```

Send one prepared JPEG frame for display testing:

```bash
ELECTRON_RUN_AS_NODE=1 outputs/linux-unpacked/delta-center \
  scripts/show-static-frame.cjs /dev/ttyACM1 /path/to/480x320.jpg
```

Only use the documented read-only probe and live-image path. Do not experiment
with firmware, serial-number, or other undocumented write commands.

## Troubleshooting

### The app says “No data”

Check that the device appears in `lsusb`, that a `/dev/ttyACM*` node exists, and
that its group or ACL allows the logged-in user to open it. Reinstall the udev
rule and reconnect the USB cable if necessary.

```bash
sudo install -m 0644 udev/99-delta-cw360lcd.rules \
  /etc/udev/rules.d/99-delta-cw360lcd.rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### An uploaded image or GIF is blank

Rebuild and reinstall from the current importer. It patches asynchronous image
dimension detection, Linux absolute-path validation, and the local media server
so that files under `~/.config/DELTA_CENTRO/media` can be rendered.

### The launcher does not open

Run the app from a terminal and inspect its output and main log:

```bash
~/.local/opt/delta-center/delta-center-launch
tail -n 100 ~/.config/DELTA_CENTRO/logs/main.log
```

### Stop automatic startup

```bash
rm ~/.config/autostart/delta-center.desktop
```

## Remove

```bash
rm -rf ~/.local/opt/delta-center
rm -f ~/.local/share/applications/delta-center.desktop
rm -f ~/.config/autostart/delta-center.desktop
sudo rm -f /etc/udev/rules.d/99-delta-cw360lcd.rules
sudo udevadm control --reload-rules
```

User themes and settings are intentionally left under
`~/.config/DELTA_CENTRO`. Remove that directory separately only if you also want
to delete all uploaded media and custom themes.
