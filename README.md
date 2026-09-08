# TennisToday

A [Cinnamon](https://github.com/linuxmint/Cinnamon) desklet that puts **Neeraj Jakhar**’s [live-tennis](https://github.com/homebackend/live-tennis) idea on the Linux Mint / Cinnamon desktop.

This app uses ESPN, a free, different data source for live scores.

On Cinnamon, scores refresh automatically, live matches are listed first, and you can click a match to open it in the browser.

## Install

Cinnamon loads desklets from `~/.local/share/cinnamon/desklets/`. The folder name must match the desklet UUID.

```bash
git clone https://github.com/greyster1/TennisToday.git
mkdir -p ~/.local/share/cinnamon/desklets
cp -a TennisToday ~/.local/share/cinnamon/desklets/live-tennis@homebackend
```

Then either:

- open **System Settings → Desklets → Installed**, enable **Tennis Today**, or
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

Match data comes from ESPN’s public tennis scoreboard. This is not an official ATP Tour or WTA product.

## License

[GPL-3.0-or-later](LICENSE)
