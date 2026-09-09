# TennisToday

A [Cinnamon](https://github.com/linuxmint/Cinnamon) desklet for ATP and WTA scores on the Linux Mint / Cinnamon desktop.

![TennisToday](tennistodayshot.png)

It shows live, upcoming, and recently completed matches.

This app uses ESPN, a free data source for live scores.

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

## License

[GPL-3.0-or-later](LICENSE)
