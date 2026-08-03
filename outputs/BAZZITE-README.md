# Delta Center 2.0.11 compatibility build for Bazzite

This is a local compatibility package made from the Delta Center installation supplied on this PC. It is for migration/testing and must not be redistributed because it contains Delta's compiled UI and artwork. **Copy the entire `outputs` directory to external storage before formatting Windows.** The runtime archive is self-contained, so the original Delta installer and Windows installation will not be needed afterward.

## Install

Copy these three files to the Bazzite machine in the same directory:

- `delta-center-linux-compat-2.0.11-x64.tar.gz`
- `install-on-bazzite.sh`
- `99-delta-cw360lcd.rules`

Also preserve `CONTINUE-ON-LINUX.md`, `delta-center-linux-handoff-source.zip`, and `SHA256SUMS.txt` so development can continue from Linux.

Open a terminal in that directory and run:

```bash
chmod +x install-on-bazzite.sh
./install-on-bazzite.sh
```

Unplug and reconnect the cooler, then launch **Delta Center (CW360LCD)** from the application menu.

## Notes

- Do not run the application as root. The udev rule grants the logged-in desktop user access to Delta USB serial devices `33c3:7788`, `33c3:7791`, and `33c3:7792`.
- The vendor updater and cloud services are disabled in this build.
- Linux sensors are best-effort. CPU, RAM, disks, network, `/sys` temperatures, `sensors -j`, and `nvidia-smi` are used when available; missing tools do not prevent startup.
- GIFs and images should work through the existing renderer. Video metadata/import expects `ffmpeg` and `ffprobe` on `PATH`; Bazzite normally provides the needed multimedia stack.
- If the program does not open from the menu, run `~/.local/opt/delta-center/delta-center-launch` in a terminal and save the output for diagnosis.

## Remove

```bash
rm -rf ~/.local/opt/delta-center
rm -f ~/.local/share/applications/delta-center.desktop
sudo rm -f /etc/udev/rules.d/99-delta-cw360lcd.rules
sudo udevadm control --reload-rules
```
