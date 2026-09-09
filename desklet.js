// TennisToday desklet — TennisToday@greyster1
// Desktop scores for ATP and WTA.
//
// Copyright (C) 2026 Graham Ferguson
// SPDX-License-Identifier: GPL-3.0-or-later

const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Soup = imports.gi.Soup;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;
const ByteArray = imports.byteArray;
const Gettext = imports.gettext;

const UUID = "TennisToday@greyster1";
const ESPN_URL = "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=tennis";
const ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/tennis/leagues";
const ESPN_PAGE = "https://www.espn.com/tennis/scoreboard";
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IS_SOUP_2 = Soup.MAJOR_VERSION === undefined || Soup.MAJOR_VERSION === 2;
const SET_COL_PX = 28;
const SCORE_FIT_BASE_PX = 400;
const CHROME_PX = 36;
const SCORE_GUTTER_PX = 16;
const MAX_BOARD_FINISHED = 16;

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

function _etYmd(ms) {
    if (ms === undefined || ms === null || isNaN(ms)) {
        return "";
    }
    try {
        let parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date(ms));
        let y = "", mo = "", d = "";
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].type === "year") {
                y = parts[i].value;
            } else if (parts[i].type === "month") {
                mo = parts[i].value;
            } else if (parts[i].type === "day") {
                d = parts[i].value;
            }
        }
        return y + "-" + mo + "-" + d;
    } catch (e) {
        let dt = new Date(ms);
        return dt.getUTCFullYear() + "-" + String(dt.getUTCMonth() + 1).padStart(2, "0") + "-" + String(dt.getUTCDate()).padStart(2, "0");
    }
}

function _etCompact(ms) {
    return _etYmd(ms).replace(/-/g, "");
}

function _httpsRef(ref) {
    return String(ref || "").replace(/^http:\/\//, "https://");
}

function _eventIdFromRef(ref) {
    let m = String(ref || "").match(/\/events\/([^/?]+)/);
    return m ? m[1] : "";
}

function _matchKey(m) {
    let names = (m.teams || []).map(function (t) { return t.name || ""; });
    names.sort();
    return (m.tournament || "") + "::" + names.join("|");
}

function _nameKey(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function _pairKeyFromNames(names) {
    let keys = (names || []).map(_nameKey);
    keys.sort();
    return keys.join("|");
}

function _isGrandSlam(name) {
    let n = String(name || "").toLowerCase();
    return n.indexOf("us open") !== -1
        || n.indexOf("u.s. open") !== -1
        || n.indexOf("u.s.open") !== -1
        || n.indexOf("australian open") !== -1
        || n.indexOf("french open") !== -1
        || n.indexOf("roland garros") !== -1
        || n.indexOf("wimbledon") !== -1;
}

function _countryFromLogo(url) {
    if (!url) {
        return "";
    }
    let m = String(url).match(/\/([a-z]{3})\.png(?:\?|$)/i);
    return m ? m[1].toUpperCase() : "";
}

function _parseEvent(event, tour) {
    let notes = event.notes || [];
    let roundName = "";
    let courtName = "";
    let leadText = "";
    if (notes.length) {
        leadText = notes[0].text || "";
        let typeText = notes[0].type || "";
        let dash = typeText.indexOf(" - ");
        if (dash >= 0) {
            roundName = typeText.substring(0, dash);
            courtName = typeText.substring(dash + 3);
        } else {
            roundName = typeText;
        }
    }

    let ctype = event.competitionType || {};
    let competitors = (event.competitors || []).slice();
    competitors.sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
    });

    let teams = competitors.map(function (c) {
        let lines = (c.linescores || []).map(function (ls) {
            return {
                value: ls.setScore != null ? ls.setScore : ls.value,
                tiebreak: ls.tieBreakScore || ls.tiebreak || null,
                winner: !!ls.winner
            };
        });
        return {
            name: c.displayName || c.name || c.abbreviation || "TBD",
            seed: c.tournamentSeed || null,
            country: _countryFromLogo(c.logo),
            score: c.score || "",
            linescores: lines,
            serving: !!c.possession,
            winner: !!c.winner,
            isDoubles: c.type === "team"
        };
    });

    let eventType = ctype.text || "";
    let isDoubles = teams.some(function (t) {
            return t.isDoubles || (t.name && t.name.indexOf(" / ") !== -1);
        })
        || /doubles/i.test(eventType)
        || /doubles/i.test(ctype.slug || "");

    let status = "Upcoming";
    if (event.status === "in") {
        status = "Live";
    } else if (event.status === "post") {
        status = "Finished";
    }

    let link = event.link || "";
    if (!link && event.links && event.links.length) {
        link = event.links[0].href || "";
    }

    let tournamentName = event.name || event.shortName || "";
    let tourCode = String(tour || "").toUpperCase();
    let slam = _isGrandSlam(tournamentName);
    return {
        id: String(event.id || event.competitionId || event.uid || ""),
        tour: tourCode,
        isGrandSlam: slam,
        badge: slam ? "Grand Slam" : tourCode,
        tournament: tournamentName,
        location: event.location || "",
        roundName: roundName,
        courtName: courtName,
        eventType: eventType,
        status: status,
        statusCode: event.status,
        summary: event.summary || "",
        leadText: leadText,
        teams: teams,
        isDoubles: isDoubles,
        recent: !!event.recent,
        link: link,
        start: event.date || "",
        startMs: event.date ? Date.parse(event.date) : NaN,
        isToday: _etYmd(event.date ? Date.parse(event.date) : NaN) === _etYmd(Date.now())
    };
}

function parseEspnHeader(json) {
    let matches = [];
    let sports = (json && json.sports) || [];
    for (let s = 0; s < sports.length; s++) {
        let leagues = sports[s].leagues || [];
        for (let i = 0; i < leagues.length; i++) {
            let league = leagues[i];
            let tour = league.abbreviation || league.name || "";
            let events = league.events || [];
            for (let j = 0; j < events.length; j++) {
                matches.push(_parseEvent(events[j], tour));
            }
        }
    }
    return matches;
}

function TennisTodayDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

TennisTodayDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.metadata = metadata;
        this.enableAtp = true;
        this.enableWta = true;
        this.enableGrandSlam = true;
        this.showDoubles = true;
        this.refreshSeconds = 60;
        this.showCompleted = true;
        this.maxCompleted = 4;
        this.showUpcoming = true;
        this.maxUpcoming = 12;
        this.maxLive = 12;
        this.deskletWidth = 420;
        this.maxHeight = 720;

        this._matches = [];
        this._error = null;
        this._updatedAt = null;
        this._timer = null;
        this._httpSession = null;
        this._fetching = false;
        this._boardCache = [];
        this._lastBoardAt = 0;
        this._lastSnapshot = "";

        this._initHttp();
        this._bindSettings(deskletId);
        this._buildChrome();
        this.setHeader(_("TennisToday"));
        this._populateContextMenu();
        this._render();
        this._fetch();
        this._schedule();
    },

    _initHttp: function () {
        if (IS_SOUP_2) {
            this._httpSession = new Soup.SessionAsync();
            Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ProxyResolverDefault());
        } else {
            this._httpSession = new Soup.Session();
        }
        this._httpSession.timeout = 45;
        this._httpSession.idle_timeout = 45;
    },

    _bindSettings: function (deskletId) {
        this.settings = new Settings.DeskletSettings(this, UUID, deskletId);
        this.settings.bindProperty(Settings.BindingDirection.IN, "enable-atp", "enableAtp", this._onToursChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "enable-wta", "enableWta", this._onToursChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "enable-grand-slam", "enableGrandSlam", this._onToursChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-doubles", "showDoubles", this._onToursChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "refresh-seconds", "refreshSeconds", this._onRefreshSettingChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-completed", "showCompleted", this._onToursChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "max-completed", "maxCompleted", this._onSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-upcoming", "showUpcoming", this._onSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "max-upcoming", "maxUpcoming", this._onSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "max-live", "maxLive", this._onSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "desklet-width", "deskletWidth", this._onSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "max-height", "maxHeight", this._onSettingsChanged, null);
    },

    _onSettingsChanged: function () {
        this._render();
    },

    _onToursChanged: function () {
        this._lastSnapshot = "";
        this._boardCache = [];
        this._render();
        this._fetch();
    },

    _onRefreshSettingChanged: function () {
        this._schedule();
    },

    _populateContextMenu: function () {
        let refresh = new PopupMenu.PopupMenuItem(_("Refresh now"));
        refresh.connect("activate", () => this._fetch(true));
        this._menu.addMenuItem(refresh);

        let open = new PopupMenu.PopupMenuItem(_("Open ESPN scoreboard"));
        open.connect("activate", () => this._openUrl(ESPN_PAGE));
        this._menu.addMenuItem(open);
    },

    _openUrl: function (url) {
        if (!url) {
            return;
        }
        try {
            Gio.app_info_launch_default_for_uri(url, global.create_app_launch_context());
        } catch (e) {
            global.logError(UUID + " failed to open URL: " + e);
        }
    },

    _buildChrome: function () {
        this._root = new St.BoxLayout({
            vertical: true,
            style_class: "lt-desklet"
        });
        this._root.clip_to_allocation = false;
        this.setContent(this._root);
        if (this.content) {
            this.content.clip_to_allocation = false;
        }
        if (this.actor) {
            this.actor.clip_to_allocation = false;
        }
    },

    _escapeMarkup: function (value) {
        return GLib.markup_escape_text(String(value), -1);
    },

    _tiebreakMarkup: function (games, tiebreak) {
        let gamesText = this._escapeMarkup(games);
        if (tiebreak === undefined || tiebreak === null || tiebreak === "") {
            return gamesText;
        }
        return gamesText + '<span size="xx-small" rise="6000">(' + this._escapeMarkup(tiebreak) + ")</span>";
    },

    _scoreLineMarkup: function (score) {
        return this._escapeMarkup(score).replace(/\((\d+(?:-\d+)?)\)/g, '<span size="xx-small" rise="6000">($1)</span>');
    },

    _label: function (text, styleClass, wrap, noEllipsize, markup) {
        let label = new St.Label({
            style_class: styleClass || ""
        });
        if (markup) {
            label.clutter_text.set_markup(text || "");
        } else {
            label.set_text(text || "");
        }
        if (label.clutter_text) {
            label.clutter_text.ellipsize = (wrap || noEllipsize) ? Pango.EllipsizeMode.NONE : Pango.EllipsizeMode.END;
            if (wrap) {
                label.clutter_text.line_wrap = true;
                label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            }
        }
        return label;
    },

    _selectedMatches: function () {
        let live = [];
        let finished = [];
        let upcoming = [];

        for (let i = 0; i < this._matches.length; i++) {
            let m = this._matches[i];
            if (m.isGrandSlam) {
                if (!this.enableGrandSlam) {
                    continue;
                }
            } else if (m.tour === "ATP") {
                if (!this.enableAtp) {
                    continue;
                }
            } else if (m.tour === "WTA") {
                if (!this.enableWta) {
                    continue;
                }
            } else {
                continue;
            }
            if (m.isDoubles && !this.showDoubles) {
                continue;
            }
            let now = Date.now();
            let startMs = m.startMs;
            let started = !isNaN(startMs) && startMs <= now;
            let startDayEt = _etYmd(startMs);
            let todayEt = _etYmd(now);
            let yesterdayEt = _etYmd(now - 24 * 3600 * 1000);
            let overnight = started && startDayEt === yesterdayEt && startDayEt !== todayEt;

            if (m.status === "Finished") {
                finished.push(m);
            } else if (m.status === "Live" || overnight) {
                live.push(m);
            } else if (m.status === "Upcoming" && (isNaN(startMs) || startDayEt === todayEt)) {
                upcoming.push(m);
            }
        }

        finished.sort(function (a, b) {
            let am = a.startMs;
            let bm = b.startMs;
            if (isNaN(am) && isNaN(bm)) {
                return 0;
            }
            if (isNaN(am)) {
                return 1;
            }
            if (isNaN(bm)) {
                return -1;
            }
            return bm - am;
        });

        upcoming.sort(function (a, b) {
            let am = a.startMs;
            let bm = b.startMs;
            if (isNaN(am) && isNaN(bm)) {
                return 0;
            }
            if (isNaN(am)) {
                return 1;
            }
            if (isNaN(bm)) {
                return -1;
            }
            return am - bm;
        });

        live = live.slice(0, this.maxLive || 12);
        if (this.showCompleted) {
            finished = finished.slice(0, this.maxCompleted || 0);
        } else {
            finished = [];
        }
        if (this.showUpcoming) {
            upcoming = upcoming.slice(0, this.maxUpcoming || 12);
        } else {
            upcoming = [];
        }
        return { live: live, finished: finished, upcoming: upcoming };
    },

    _maxSetColumns: function (matches) {
        let n = 0;
        for (let i = 0; i < matches.length; i++) {
            let teams = matches[i].teams || [];
            for (let t = 0; t < teams.length; t++) {
                let cols = (teams[t].linescores || []).length;
                if (cols > n) {
                    n = cols;
                }
            }
        }
        return n;
    },

    _fittedWidth: function (setCols) {
        let needed = SCORE_FIT_BASE_PX + Math.max(setCols, 1) * SET_COL_PX + CHROME_PX;
        return Math.max(this.deskletWidth || 420, needed);
    },

    _render: function () {
        if (!this._root) {
            return;
        }
        this._root.destroy_all_children();

        let groups = this._selectedMatches();
        let visible = groups.live.concat(groups.upcoming, groups.finished);
        let widthPx = this._fittedWidth(this._maxSetColumns(visible));
        this._root.style = "min-width: " + widthPx + "px; width: " + widthPx + "px;";
        this._root.clip_to_allocation = false;

        this._root.add_child(this._buildHeader());

        if (this._error && this._matches.length === 0) {
            this._root.add_child(this._label(this._error, "lt-error", true));
            return;
        }

        let scroll = new St.ScrollView({
            style: "max-height: " + (this.maxHeight || 720) + "px;",
            x_expand: true
        });
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        scroll.overlay_scrollbars = true;
        scroll.clip_to_allocation = false;

        let inner = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style: "padding-right: " + SCORE_GUTTER_PX + "px;"
        });
        let any = false;

        if (groups.live.length) {
            inner.add_child(this._label(_("LIVE"), "lt-section-label"));
            this._appendGroupedMatches(inner, groups.live);
            any = true;
        }
        if (groups.upcoming.length) {
            if (any) {
                inner.add_child(this._sectionRule());
            }
            inner.add_child(this._label(_("Upcoming"), "lt-section-label"));
            this._appendGroupedMatches(inner, groups.upcoming);
            any = true;
        }
        if (groups.finished.length) {
            if (any) {
                inner.add_child(this._sectionRule());
            }
            inner.add_child(this._label(_("Recently finished"), "lt-section-label"));
            this._appendGroupedMatches(inner, groups.finished);
            any = true;
        }

        if (!any) {
            inner.add_child(this._label(_("No matches to show"), "lt-empty", true));
        }

        if (scroll.add_actor) {
            scroll.add_actor(inner);
        } else {
            scroll.add_child(inner);
        }
        this._root.add_child(scroll);
    },

    _sectionRule: function () {
        return new St.Widget({
            style_class: "lt-section-rule",
            x_expand: true,
            height: 1
        });
    },

    _buildHeader: function () {
        let header = new St.BoxLayout({
            vertical: false,
            style_class: "lt-header"
        });

        let titleBox = new St.BoxLayout({ vertical: true, x_expand: true });
        titleBox.add_child(this._label(_("TennisToday"), "lt-title"));
        let stamp = this._fetching
            ? _("Updating…")
            : (this._updatedAt ? _("Updated %s").format(this._updatedAt) : _("Waiting for scores"));
        titleBox.add_child(this._label(stamp, "lt-updated"));
        header.add_child(titleBox);

        let refresh = new St.Button({
            style_class: "lt-refresh-button",
            label: "↺"
        });
        refresh.connect("clicked", () => this._fetch(true));
        header.add_child(refresh);

        let settingsBtn = new St.Button({ style_class: "lt-refresh-button" });
        settingsBtn.set_child(new St.Icon({
            icon_name: "preferences-system-symbolic",
            icon_size: 16,
            style_class: "lt-header-icon"
        }));
        settingsBtn.connect("clicked", () => this.configureDesklet());
        header.add_child(settingsBtn);
        return header;
    },

    _appendGroupedMatches: function (parent, matches) {
        let lastKey = null;
        for (let i = 0; i < matches.length; i++) {
            let m = matches[i];
            let key = m.tour + "|" + m.tournament;
            if (key !== lastKey) {
                parent.add_child(this._buildTournamentHeader(m));
                lastKey = key;
            }
            parent.add_child(this._buildMatch(m));
        }
    },

    _buildTournamentHeader: function (match) {
        let row = new St.BoxLayout({
            vertical: false,
            style_class: "lt-tournament-row"
        });
        let badge = match.badge || match.tour;
        let tourClass = "lt-tour-other";
        if (badge === "Grand Slam") {
            tourClass = "lt-tour-slam";
        } else if (match.tour === "ATP") {
            tourClass = "lt-tour-atp";
        } else if (match.tour === "WTA") {
            tourClass = "lt-tour-wta";
        }
        row.add_child(this._label(badge, "lt-tour-badge " + tourClass));
        let name = match.tournament;
        if (match.location) {
            name += "  ·  " + match.location;
        }
        let nameLabel = this._label(name, "lt-tournament-name");
        nameLabel.x_expand = true;
        row.add_child(nameLabel);
        return row;
    },

    _buildMatch: function (match) {
        let box = new St.BoxLayout({
            vertical: true,
            style_class: "lt-match",
            reactive: true
        });

        let metaBits = [];
        if (match.eventType) {
            metaBits.push(match.eventType);
        }
        if (match.roundName) {
            metaBits.push(match.roundName);
        }
        if (match.courtName) {
            metaBits.push(match.courtName);
        }
        if (metaBits.length) {
            box.add_child(this._label(metaBits.join("  ·  "), "lt-match-meta"));
        }

        let maxSets = 0;
        for (let i = 0; i < match.teams.length; i++) {
            maxSets = Math.max(maxSets, (match.teams[i].linescores || []).length);
        }

        for (let i = 0; i < match.teams.length; i++) {
            box.add_child(this._buildTeamRow(match.teams[i], maxSets));
        }

        let statusClass = "lt-status-upcoming";
        if (match.status === "Live") {
            statusClass = "lt-status-live";
        } else if (match.status === "Finished") {
            statusClass = "lt-status-finished";
        }
        let statusText = match.status;
        if (match.status === "Live" && match.summary) {
            statusText = _("LIVE") + " · " + match.summary;
        } else if (match.status === "Upcoming" && match.summary) {
            statusText = match.summary;
        }
        box.add_child(this._label(statusText, statusClass));

        if (match.link) {
            box.connect("button-press-event", (actor, event) => {
                if (event.get_button() === 1) {
                    this._openUrl(match.link);
                    return true;
                }
                return false;
            });
        }
        return box;
    },

    _buildTeamRow: function (team, maxSets) {
        let row = new St.BoxLayout({ vertical: false });

        row.add_child(this._label(team.serving ? "●" : " ", "lt-serve", false, true));

        let name = team.name;
        let nameClass = team.winner ? "lt-player-winner" : "lt-player-name";
        let nameCluster = new St.BoxLayout({ vertical: false, x_expand: false });
        nameCluster.add_child(this._label(name, nameClass, false, true));
        if (team.seed) {
            nameCluster.add_child(this._label("(" + team.seed + ")", "lt-player-seed", false, true));
        }
        if (team.country) {
            nameCluster.add_child(this._label(team.country, "lt-country", false, true));
        }
        row.add_child(nameCluster);
        row.add_child(new St.Bin({ x_expand: true }));

        let scoreBox = new St.BoxLayout({
            vertical: false,
            style_class: "lt-score-box",
            x_expand: false
        });
        if (maxSets > 0) {
            let lines = team.linescores || [];
            for (let i = 0; i < maxSets; i++) {
                let ls = lines[i];
                let text = " ";
                let cls = "lt-set";
                let markup = false;
                if (ls && ls.value != null && ls.value !== "") {
                    if (ls.tiebreak && Number(ls.value) >= 6) {
                        text = this._tiebreakMarkup(ls.value, ls.tiebreak);
                        markup = true;
                    } else {
                        text = String(Math.round(Number(ls.value)));
                    }
                    if (ls.winner) {
                        cls += " lt-set-win";
                    }
                }
                let cell = new St.Bin({
                    style_class: "lt-set-cell",
                    x_expand: false
                });
                cell.set_width(SET_COL_PX);
                cell.set_child(this._label(text, cls, false, true, markup));
                scoreBox.add_child(cell);
            }
        } else if (team.score) {
            scoreBox.add_child(this._label(this._scoreLineMarkup(team.score), "lt-score-line", false, true, true));
        }
        row.add_child(scoreBox);
        row.add_child(new St.Bin({
            width: SCORE_GUTTER_PX,
            x_expand: false
        }));
        return row;
    },

    _schedule: function () {
        if (this._timer) {
            Mainloop.source_remove(this._timer);
            this._timer = null;
        }
        let seconds = Math.max(10, parseInt(this.refreshSeconds, 10) || 30);
        this._timer = Mainloop.timeout_add_seconds(seconds, () => {
            this._fetch();
            return true;
        });
    },

    _toggledLeagues: function () {
        let leagues = [];
        if (this.enableAtp || this.enableGrandSlam) {
            leagues.push("atp");
        }
        if (this.enableWta || this.enableGrandSlam) {
            leagues.push("wta");
        }
        return leagues;
    },

    _eventWanted: function (league, eventId, eventNames) {
        let name = eventNames[eventId] || "";
        if (league === "atp" && this.enableAtp) {
            return true;
        }
        if (league === "wta" && this.enableWta) {
            return true;
        }
        if (this.enableGrandSlam && (!name || _isGrandSlam(name))) {
            return true;
        }
        return false;
    },

    _matchTourEnabled: function (league, tournament) {
        if (_isGrandSlam(tournament) && this.enableGrandSlam) {
            return true;
        }
        if (league === "wta") {
            return !!this.enableWta;
        }
        return !!this.enableAtp;
    },

    _etDateList: function () {
        let today = _etCompact(Date.now());
        let yest = _etCompact(Date.now() - 24 * 3600 * 1000);
        if (yest && yest !== today) {
            return [yest, today];
        }
        return [today];
    },

    _fetchDatedBoard: function (headerMatches, done) {
        let leagues = this._toggledLeagues();
        if (!leagues.length) {
            done([]);
            return;
        }
        let locToName = {};
        let eventNames = {};
        for (let i = 0; i < (headerMatches || []).length; i++) {
            let m = headerMatches[i];
            if (m.location && m.tournament) {
                locToName[m.location] = m.tournament;
            }
            if (m.id && m.tournament) {
                eventNames[m.id] = m.tournament;
            }
        }
        let dates = this._etDateList();
        let listsLeft = leagues.length * dates.length;
        let stubs = [];
        let finishLists = () => {
            listsLeft -= 1;
            if (listsLeft > 0) {
                return;
            }
            this._hydrateStubs(stubs, locToName, eventNames, headerMatches, done);
        };
        for (let l = 0; l < leagues.length; l++) {
            for (let d = 0; d < dates.length; d++) {
                let league = leagues[l];
                let day = dates[d];
                // Dated event lists are a few hundred bytes. Do not GET /events/{id}:
                // that resource inlines the whole tournament (~1MB).
                this._fetchJson(ESPN_CORE + "/" + league + "/events?dates=" + day + "&limit=20", false, (json) => {
                    let items = (json && json.items) || [];
                    let ids = [];
                    let seen = {};
                    for (let n = 0; n < items.length; n++) {
                        let id = _eventIdFromRef(items[n].$ref || items[n]);
                        if (!id || seen[id] || !this._eventWanted(league, id, eventNames)) {
                            continue;
                        }
                        seen[id] = true;
                        ids.push(id);
                    }
                    if (!ids.length) {
                        finishLists();
                        return;
                    }
                    listsLeft += ids.length;
                    finishLists();
                    for (let x = 0; x < ids.length; x++) {
                        this._fetchJson(
                            ESPN_CORE + "/" + league + "/events/" + ids[x] + "/competitions?dates=" + day + "&limit=50",
                            false,
                            (cjson) => {
                                let comps = (cjson && cjson.items) || [];
                                for (let c = 0; c < comps.length; c++) {
                                    stubs.push({ league: league, eventId: ids[x], comp: comps[c] });
                                }
                                finishLists();
                            }
                        );
                    }
                });
            }
        }
    },

    _hydrateStubs: function (stubs, locToName, eventNames, headerMatches, done) {
        let now = Date.now();
        let headerByPair = {};
        for (let h = 0; h < (headerMatches || []).length; h++) {
            let m = headerMatches[h];
            let names = (m.teams || []).map(function (t) { return t.name || ""; });
            headerByPair[_pairKeyFromNames(names)] = m;
        }
        let wanted = [];
        for (let i = 0; i < stubs.length; i++) {
            let stub = stubs[i];
            let c = stub.comp;
            let slug = ((c.type && c.type.slug) || "") + " " + ((c.type && c.type.text) || "");
            if (!this.showDoubles && /doubles/i.test(slug)) {
                continue;
            }
            let tName = eventNames[stub.eventId] || "";
            if (tName && !this._matchTourEnabled(stub.league, tName)) {
                continue;
            }
            let startMs = c.date ? Date.parse(c.date) : NaN;
            if (!isNaN(startMs) && startMs > now + 2 * 3600 * 1000) {
                continue;
            }
            let names = (c.competitors || []).map(function (p) { return p.name || ""; });
            let headerHit = headerByPair[_pairKeyFromNames(names)];
            if (headerHit) {
                if (headerHit.status === "Live" || headerHit.status === "Finished") {
                    continue;
                }
                if (headerHit.status === "Upcoming" && (isNaN(startMs) || startMs > now)) {
                    continue;
                }
            }
            wanted.push(stub);
        }
        if (!wanted.length) {
            done([]);
            return;
        }
        let left = wanted.length;
        let stated = [];
        let finishStatus = () => {
            left -= 1;
            if (left > 0) {
                return;
            }
            let live = [];
            let finished = [];
            for (let s = 0; s < stated.length; s++) {
                if (stated[s].state === "in") {
                    live.push(stated[s]);
                } else if (stated[s].state === "post") {
                    finished.push(stated[s]);
                }
            }
            finished.sort(function (a, b) {
                let am = a.stub.comp.date ? Date.parse(a.stub.comp.date) : 0;
                let bm = b.stub.comp.date ? Date.parse(b.stub.comp.date) : 0;
                return bm - am;
            });
            if (!this.showCompleted) {
                finished = [];
            } else if (finished.length > MAX_BOARD_FINISHED) {
                finished = finished.slice(0, MAX_BOARD_FINISHED);
            }
            let keep = live.concat(finished);
            if (!keep.length) {
                done([]);
                return;
            }
            this._hydrateScores(keep, locToName, eventNames, done);
        };
        for (let w = 0; w < wanted.length; w++) {
            this._readStatus(wanted[w], (row) => {
                if (row) {
                    stated.push(row);
                }
                finishStatus();
            });
        }
    },

    _readStatus: function (stub, done) {
        let c = stub.comp;
        let statusRef = c.status && c.status.$ref ? _httpsRef(c.status.$ref) : "";
        let apply = (statusObj) => {
            let st = (statusObj && statusObj.type) || {};
            let state = st.state || "";
            if (!state) {
                let winner = (c.competitors || []).some(function (p) { return p.winner; });
                let startMs = c.date ? Date.parse(c.date) : NaN;
                if (winner) {
                    state = "post";
                } else if (!isNaN(startMs) && startMs <= Date.now()) {
                    state = "in";
                } else {
                    done(null);
                    return;
                }
            }
            if (state === "post" && st.completed === false) {
                state = "in";
            }
            if (state === "pre") {
                let startMs = c.date ? Date.parse(c.date) : NaN;
                if (isNaN(startMs) || startMs > Date.now()) {
                    done(null);
                    return;
                }
                state = "in";
            }
            if (state !== "in" && state !== "post") {
                done(null);
                return;
            }
            done({ stub: stub, statusObj: statusObj, state: state });
        };
        if (!statusRef) {
            apply(null);
            return;
        }
        this._fetchJson(statusRef, false, apply);
    },

    _hydrateScores: function (rows, locToName, eventNames, done) {
        let left = rows.length;
        let out = [];
        let finishOne = () => {
            left -= 1;
            if (left <= 0) {
                done(out);
            }
        };
        for (let i = 0; i < rows.length; i++) {
            this._hydrateOne(rows[i], locToName, eventNames, (m) => {
                if (m) {
                    out.push(m);
                }
                finishOne();
            });
        }
    },

    _hydrateOne: function (row, locToName, eventNames, done) {
        let stub = row.stub;
        let c = stub.comp;
        let statusObj = row.statusObj;
        let state = row.state;
        let competitors = (c.competitors || []).slice();
        competitors.sort(function (a, b) {
            return (a.order || 0) - (b.order || 0);
        });
        let pending = Math.max(1, competitors.length);
        let linesById = {};
        let finish = () => {
            pending -= 1;
            if (pending > 0) {
                return;
            }
            let st = (statusObj && statusObj.type) || {};
            let location = (c.venue && c.venue.address && c.venue.address.summary) || "";
            let tournament = eventNames[stub.eventId] || locToName[location] || location || "Tournament";
            if (!this._matchTourEnabled(stub.league, tournament)) {
                done(null);
                return;
            }
            let slug = (c.type && c.type.slug) || "";
            let eventType = (c.type && c.type.text) || "";
            let teams = competitors.map(function (p) {
                let items = (linesById[p.id] && linesById[p.id].items) || [];
                let lines = items.map(function (ls) {
                    return {
                        value: ls.value,
                        tiebreak: ls.tiebreak || ls.tieBreakScore || null,
                        winner: false
                    };
                });
                return {
                    name: p.name || "TBD",
                    seed: p.tournamentSeed || null,
                    country: "",
                    score: "",
                    linescores: lines,
                    serving: false,
                    winner: !!p.winner,
                    isDoubles: p.type === "team" || /doubles/i.test(slug)
                };
            });
            let slam = _isGrandSlam(tournament);
            done({
                id: String(c.id || ""),
                tour: stub.league === "wta" ? "WTA" : "ATP",
                isGrandSlam: slam,
                badge: slam ? "Grand Slam" : (stub.league === "wta" ? "WTA" : "ATP"),
                tournament: tournament,
                location: location,
                roundName: (c.round && (c.round.displayName || c.round.description)) || "",
                courtName: (c.court && (c.court.name || c.court.displayName)) || "",
                eventType: eventType,
                status: state === "in" ? "Live" : "Finished",
                statusCode: state,
                summary: (st.detail || st.shortDetail || st.description || "").toString(),
                leadText: "",
                teams: teams,
                isDoubles: /doubles/i.test(slug) || /doubles/i.test(eventType),
                recent: true,
                link: (c.links && c.links[0] && c.links[0].href) || "",
                start: c.date || "",
                startMs: c.date ? Date.parse(c.date) : NaN,
                isToday: true
            });
        };
        if (!competitors.length) {
            finish();
            return;
        }
        for (let i = 0; i < competitors.length; i++) {
            let p = competitors[i];
            let lsRef = p.linescores && p.linescores.$ref ? _httpsRef(p.linescores.$ref) : "";
            if (!lsRef) {
                finish();
                continue;
            }
            this._fetchJson(lsRef, false, (json) => {
                linesById[p.id] = json;
                finish();
            });
        }
    },

    _fetchJson: function (url, useUa, callback) {
        let message = Soup.Message.new("GET", url);
        try {
            if (useUa) {
                message.request_headers.replace("User-Agent", USER_AGENT);
            } else {
                message.request_headers.replace("User-Agent", "curl/8.5.0");
            }
            message.request_headers.append("Accept", "application/json");
        } catch (e) {
            try {
                message.request_headers.append("User-Agent", useUa ? USER_AGENT : "curl/8.5.0");
            } catch (e2) {
                global.logError(UUID + " header error: " + e2);
            }
        }
        if (IS_SOUP_2) {
            this._httpSession.queue_message(message, (session, msg) => {
                let json = null;
                try {
                    if (msg && msg.status_code === 200 && msg.response_body) {
                        json = JSON.parse(msg.response_body.data);
                    }
                } catch (e) {
                    global.logError(UUID + " parse error: " + e);
                }
                callback(json);
            });
        } else {
            this._httpSession.send_and_read_async(message, Soup.MessagePriority.NORMAL, null, (session, result) => {
                let json = null;
                try {
                    if (message.get_status() === 200) {
                        let bytes = this._httpSession.send_and_read_finish(result);
                        json = JSON.parse(ByteArray.toString(bytes.get_data()));
                    }
                } catch (e) {
                    global.logError(UUID + " fetch error: " + e);
                }
                callback(json);
            });
        }
    },

    _snapshotMatches: function (matches) {
        let parts = [];
        for (let i = 0; i < matches.length; i++) {
            let m = matches[i];
            parts.push(m.status, m.summary || "", m.tournament || "", m.roundName || "");
            let teams = m.teams || [];
            for (let t = 0; t < teams.length; t++) {
                let tm = teams[t];
                parts.push(tm.name || "", tm.serving ? "1" : "0", tm.winner ? "1" : "0", tm.score || "");
                let lines = tm.linescores || [];
                for (let k = 0; k < lines.length; k++) {
                    parts.push(String(lines[k].value), String(lines[k].tiebreak || ""));
                }
            }
        }
        return parts.join("\t");
    },

    _fetch: function () {
        if (this._fetching || !this._httpSession) {
            return;
        }
        this._fetching = true;

        this._fetchJson(ESPN_URL, true, (headerJson) => {
            this._bufHeader = headerJson;
            let headerMatches = headerJson ? parseEspnHeader(headerJson) : [];
            this._fetchDatedBoard(headerMatches, (board) => {
                this._boardCache = board || [];
                this._lastBoardAt = Date.now();
                this._finishFetch(headerMatches, this._boardCache);
            });
        });
    },

    _finishFetch: function (header, board) {
        this._fetching = false;
        try {
            header = header || [];
            board = board || [];
            header = header.filter((m) => {
                let league = m.tour === "WTA" ? "wta" : "atp";
                if (!this._matchTourEnabled(league, m.tournament)) {
                    return false;
                }
                if (m.isDoubles && !this.showDoubles) {
                    return false;
                }
                return true;
            });
            let fromBoard = [];
            let seen = {};
            for (let i = 0; i < board.length; i++) {
                let key = _matchKey(board[i]);
                if (!seen[key]) {
                    seen[key] = true;
                    fromBoard.push(board[i]);
                }
            }
            let rest = [];
            for (let j = 0; j < header.length; j++) {
                if (!seen[_matchKey(header[j])]) {
                    rest.push(header[j]);
                }
            }
            let next = fromBoard.concat(rest);
            let snap = this._snapshotMatches(next);
            if (snap === this._lastSnapshot) {
                return;
            }
            this._lastSnapshot = snap;
            this._matches = next;
            this._error = next.length ? null : _("Could not fetch scores");
            this._updatedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch (e) {
            this._error = _("Invalid score data");
            global.logError(UUID + " merge error: " + e);
        }
        this._render();
    },

    on_desklet_removed: function () {
        if (this._timer) {
            Mainloop.source_remove(this._timer);
            this._timer = null;
        }
        if (this._httpSession) {
            try {
                this._httpSession.abort();
            } catch (e) {
            }
        }
    }
};

function main(metadata, deskletId) {
    return new TennisTodayDesklet(metadata, deskletId);
}
