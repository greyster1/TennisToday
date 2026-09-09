# TennisToday

A [Cinnamon](https://github.com/linuxmint/Cinnamon) desklet for ATP and WTA scores on the Linux Mint / Cinnamon desktop.

This app uses ESPN, a free data source for live scores.

On Cinnamon, scores refresh automatically, live matches are listed first, and you can click a match to open it in the browser.

## Install

Cinnamon loads desklets from `~/.local/share/cinnamon/desklets/`. The folder name must match the desklet UUID `TennisToday@greyster1`.

```bash
mkdir -p ~/.local/share/cinnamon/desklets
git clone https://github.com/greyster1/TennisToday.git ~/.local/share/cinnamon/desklets/TennisToday@greyster1
```

Then either:

- open **System Settings → Desklets → Installed**, enable **TennisToday**, or
- log out and back in, then add it from Desklets

Once it is on the desktop, drag it where you want it. Desklets sit on the wallpaper, so they are behind open windows — use show-desktop (`Super+D`) if you cannot see it.

## Use

- Three sections, in order: **LIVE**, **Upcoming** (today’s not-yet-started matches), then **Recently finished**
- A green dot marks the player serving
- Click **↺** to refresh (it also refreshes on a timer)
- Click a match to open the ESPN scoreboard for that event
- Right-click the desklet for **Refresh now**, **Configure…**, or **Remove**

In **Configure…** you can turn ATP / WTA / doubles on or off, show or hide today’s upcoming and recently finished matches, and change width, height, and refresh interval.

## Data

Match data comes from ESPN’s public tennis scoreboard. This is not an official ATP Tour or WTA product.

## License

[GPL-3.0-or-later](LICENSE)
