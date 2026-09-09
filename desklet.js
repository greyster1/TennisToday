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
const ESPN_ATP_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard";
const ESPN_WTA_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard";
const ESPN_PAGE = "https://www.espn.com/tennis/scoreboard";
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IS_SOUP_2 = Soup.MAJOR_VERSION === undefined || Soup.MAJOR_VERSION === 2;
const SET_COL_PX = 28;
const SCORE_FIT_BASE_PX = 400;
const CHROME_PX = 36;
const SCORE_GUTTER_PX = 16;

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

function _matchKey(m) {
    let names = (m.teams || []).map(function (t) { return t.name || ""; });
    names.sort();
    return (m.tournament || "") + "::" + names.join("|");
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

function parseEspnScoreboardLive(json, tour) {
    let matches = [];
    function walk(node, event) {
        let groupingName = (node.grouping && node.grouping.displayName) || "";
        let comps = node.competitions || [];
        for (let i = 0; i < comps.length; i++) {
            let c = comps[i];
            let st = (c.status && c.status.type) || {};
            if (st.state !== "in") {
                continue;
            }
            let competitors = (c.competitors || []).slice();
            competitors.sort(function (a, b) {
                return (a.order || 0) - (b.order || 0);
            });
            let teams = competitors.map(function (p) {
                let ath = p.athlete || {};
                let lines = (p.linescores || []).map(function (ls) {
                    return {
                        value: ls.setScore != null ? ls.setScore : ls.value,
                        tiebreak: ls.tieBreakScore || ls.tiebreak || null,
                        winner: !!ls.winner
                    };
                });
                let rank = p.curatedRank || {};
                return {
                    name: ath.displayName || p.displayName || ath.shortName || p.abbreviation || "TBD",
                    seed: p.tournamentSeed || rank.current || null,
                    country: _countryFromLogo((ath.flag && ath.flag.href) || p.logo),
                    score: p.score || "",
                    linescores: lines,
                    serving: !!p.possession,
                    winner: !!p.winner,
                    isDoubles: p.type === "team" || !p.athlete
                };
            });
            let ctype = c.type || {};
            let eventType = ctype.text || groupingName || "";
            let isDoubles = teams.some(function (t) {
                    return t.isDoubles || (t.name && t.name.indexOf(" / ") !== -1);
                })
                || /doubles/i.test(eventType)
                || /doubles/i.test(ctype.slug || "");
            let notes = c.notes || [];
            let roundName = (c.round && c.round.displayName) || "";
            let courtName = (c.venue && c.venue.court) || "";
            if (notes.length && notes[0].type) {
                let dash = String(notes[0].type).indexOf(" - ");
                if (dash >= 0) {
                    if (!roundName) {
                        roundName = notes[0].type.substring(0, dash);
                    }
                    if (!courtName) {
                        courtName = notes[0].type.substring(dash + 3);
                    }
                }
            }
            let tournamentName = event.name || event.shortName || "";
            let slam = _isGrandSlam(tournamentName);
            let start = c.date || c.startDate || "";
            let link = "";
            if (event.links && event.links.length) {
                link = event.links[0].href || "";
            }
            matches.push({
                id: String(c.id || c.uid || ""),
                tour: String(tour || "").toUpperCase(),
                isGrandSlam: slam,
                badge: slam ? "Grand Slam" : String(tour || "").toUpperCase(),
                tournament: tournamentName,
                location: (c.venue && c.venue.fullName) || "",
                roundName: roundName,
                courtName: courtName,
                eventType: eventType,
                status: "Live",
                statusCode: "in",
                summary: (st.detail || st.shortDetail || st.description || "").toString(),
                leadText: notes.length ? (notes[0].text || "") : "",
                teams: teams,
                isDoubles: isDoubles,
                recent: true,
                link: link,
                start: start,
                startMs: start ? Date.parse(start) : NaN,
                isToday: true
            });
        }
        let kids = node.groupings || [];
        for (let k = 0; k < kids.length; k++) {
            walk(kids[k], event);
        }
    }
    let events = (json && json.events) || [];
    for (let e = 0; e < events.length; e++) {
        walk(events[e], events[e]);
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
        this.refreshSeconds = 30;
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
        this._httpSession.timeout = 20;
        this._httpSession.idle_timeout = 20;
    },

    _bindSettings: function (deskletId) {
        this.settings = new Settings.DeskletSettings(this, UUID, deskletId);
        this.settings.bindProperty(Settings.BindingDirection.IN, "enable-atp", "enableAtp", this._onSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "enable-wta", "enableWta", this._onSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "enable-grand-slam", "enableGrandSlam", this._onSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-doubles", "showDoubles", this._onSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "refresh-seconds", "refreshSeconds", this._onRefreshSettingChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-completed", "showCompleted", this._onSettingsChanged, null);
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

    _onRefreshSettingChanged: function () {
        this._schedule();
    },

    _populateContextMenu: function () {
        let refresh = new PopupMenu.PopupMenuItem(_("Refresh now"));
        refresh.connect("activate", () => this._fetch());
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
        refresh.connect("clicked", () => this._fetch());
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

    _fetchJson: function (url, useUa, callback) {
        let message = Soup.Message.new("GET", url);
        try {
            if (useUa) {
                message.request_headers.append("User-Agent", USER_AGENT);
            }
            message.request_headers.append("Accept", "application/json");
        } catch (e) {
            global.logError(UUID + " header error: " + e);
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

    _fetch: function () {
        if (this._fetching || !this._httpSession) {
            return;
        }
        this._fetching = true;
        this._pending = 3;
        this._bufHeader = null;
        this._bufLive = [];
        this._render();
        this._fetchJson(ESPN_URL, true, (json) => {
            this._bufHeader = json;
            this._onPart();
        });
        this._fetchJson(ESPN_ATP_SCOREBOARD, false, (json) => {
            if (json) {
                this._bufLive = this._bufLive.concat(parseEspnScoreboardLive(json, "ATP"));
            }
            this._onPart();
        });
        this._fetchJson(ESPN_WTA_SCOREBOARD, false, (json) => {
            if (json) {
                this._bufLive = this._bufLive.concat(parseEspnScoreboardLive(json, "WTA"));
            }
            this._onPart();
        });
    },

    _onPart: function () {
        this._pending -= 1;
        if (this._pending > 0) {
            return;
        }
        this._fetching = false;
        try {
            let header = this._bufHeader ? parseEspnHeader(this._bufHeader) : [];
            let live = this._bufLive || [];
            let seen = {};
            for (let i = 0; i < live.length; i++) {
                seen[_matchKey(live[i])] = true;
            }
            let rest = [];
            for (let j = 0; j < header.length; j++) {
                if (!seen[_matchKey(header[j])]) {
                    rest.push(header[j]);
                }
            }
            this._matches = live.concat(rest);
            this._error = (live.length || rest.length) ? null : _("Could not fetch scores");
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
