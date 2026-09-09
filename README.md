# TennisToday

A [Cinnamon](https://github.com/linuxmint/Cinnamon) desklet for ATP and WTA scores on the Linux Mint / Cinnamon desktop.

![TennisToday](tennistodayshot.png)

It shows live, upcoming, and recently completed matches.

This app uses ESPN, a free data source for live scores.

## Install

This is a [Cinnamon](https://github.com/linuxmint/Cinnamon) desklet. It will not run on GNOME, KDE, or XFCE.

Cinnamon loads desklets from `~/.local/share/cinnamon/desklets/`. The folder name must match the UUID `TennisToday@greyster1`.

```bash
mkdir -p ~/.local/share/cinnamon/desklets
git clone https://github.com/greyster1/TennisToday.git ~/.local/share/cinnamon/desklets/TennisToday@greyster1
```

Restart Cinnamon so it sees the new folder: **Ctrl+Alt+Esc**, or log out and back in.

Then open **Desklets** (right-click the desktop, or **System Settings → Desklets**), select **TennisToday**, and add it to the desktop. Cloning the repo does not place it on the wallpaper by itself.

Drag it where you want. Desklets sit on the wallpaper, behind open windows — use show-desktop (`Super+D`) if you cannot see it.

To update later:

```bash
git -C ~/.local/share/cinnamon/desklets/TennisToday@greyster1 pull
```

Then restart Cinnamon again (**Ctrl+Alt+Esc**).

## License

[GPL-3.0-or-later](LICENSE)
