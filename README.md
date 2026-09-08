# TennisToday

A [Cinnamon](https://github.com/linuxmint/Cinnamon) desklet that puts **Neeraj Jakhar**’s [live-tennis](https://github.com/homebackend/live-tennis) idea on the Linux Mint / Cinnamon desktop.

Neeraj (GitHub: [slashblog](https://github.com/slashblog), org: [homebackend](https://github.com/homebackend)) already built this for other platforms as **Live Tennis Monitor**:

- a [GNOME Shell extension](https://extensions.gnome.org/extension/8674/live-tennis-monitor/) (GNOME 45+)
- an Electron desktop app for Linux and Windows
- an Android app

Those clients show live ATP and WTA scores. TennisToday is the same idea for **Cinnamon desklets**, which his apps do not support. This repo is a Cinnamon-specific layer on top of that work (including tennis icons from his `live-tennis` assets), not a replacement for the GNOME extension or Electron app.

Source: [github.com/homebackend/live-tennis](https://github.com/homebackend/live-tennis)  
GNOME extension: [Live Tennis Monitor](https://extensions.gnome.org/extension/8674/live-tennis-monitor/)

The data source is different. His apps talk to the official ATP Tour and WTA live-score APIs (and optionally Tennis Temple). TennisToday uses ESPN’s public tennis scoreboard for ATP and WTA, because those official ATP endpoints were not usable from this Cinnamon desklet. Scores, which matches appear, and how often they update can disagree with his app.

On Cinnamon, scores refresh automatically, live matches are listed first, and you can click a match to open it in the browser.

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

Match data comes from ESPN’s public tennis scoreboard (ATP and WTA), not from the ATP Tour or WTA APIs Neeraj’s apps use. This is not an official ATP Tour or WTA product.

## License

[GPL-3.0-or-later](LICENSE), same family of license as Neeraj’s original project.
