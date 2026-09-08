# TennisToday

A [Cinnamon](https://github.com/linuxmint/Cinnamon) desklet that shows live ATP and WTA tennis scores on your Linux desktop.

It is built for **Cinnamon** (Linux Mint and other Cinnamon desktops). Scores refresh automatically, live matches are listed first, and you can click a match to open it in the browser.

## Install

Cinnamon loads desklets from `~/.local/share/cinnamon/desklets/`. The folder name must match the desklet UUID.

```bash
git clone https://github.com/greyster1/TennisToday.git
mkdir -p ~/.local/share/cinnamon/desklets
cp -a TennisToday ~/.local/share/cinnamon/desklets/live-tennis@homebackend
```

Then either:

- open **System Settings → Desklets → Installed**, enable **Live Tennis**, or
- log out and back in, then add it from Desklets

Once it is on the desktop, drag it where you want it. Desklets sit on the wallpaper, so they are behind open windows — use show-desktop (`Super+D`) if you cannot see it.

## Use

- Live matches appear at the top, grouped by tournament
- A green dot marks the player serving
- Click **↺** to refresh (it also refreshes on a timer)
- Click a match to open the ESPN scoreboard for that event
- Right-click the desklet for **Refresh now**, **Configure…**, or **Remove**

In **Configure…** you can turn ATP / WTA / doubles on or off, show recently finished or upcoming matches, and change width, height, and refresh interval.

## Data

Match data comes from ESPN’s public tennis scoreboard (ATP and WTA). This is not an official ATP Tour or WTA product.

## Credits

TennisToday is a Cinnamon desklet inspired by **Neeraj Jakhar**’s [live-tennis](https://github.com/homebackend/live-tennis) project.

Neeraj (GitHub: [slashblog](https://github.com/slashblog), org: [homebackend](https://github.com/homebackend)) built **Live Tennis Monitor** for a different desktop stack:

- a [GNOME Shell extension](https://extensions.gnome.org/extension/8674/live-tennis-monitor/) (GNOME 45+)
- an Electron desktop app for Linux and Windows
- an Android app

Those clients talk to ATP Tour and WTA live-score APIs and show floating live-score windows. TennisToday is a separate implementation for **Cinnamon desklets**, not a port of that GNOME/Electron codebase. The tennis icons in this repo come from Neeraj’s `live-tennis` assets.

Source: [github.com/homebackend/live-tennis](https://github.com/homebackend/live-tennis)  
GNOME extension: [Live Tennis Monitor](https://extensions.gnome.org/extension/8674/live-tennis-monitor/)

## License

[GPL-3.0-or-later](LICENSE), same family of license as Neeraj’s original project.
