// Tennis Today desklet — live-tennis@homebackend
// Desktop scores for ATP and WTA. Inspired by https://github.com/homebackend/live-tennis
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

const UUID = "live-tennis@homebackend";
const ESPN_URL = "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=tennis";
const ESPN_PAGE = "https://www.espn.com/tennis/scoreboard";
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IS_SOUP_2 = Soup.MAJOR_VERSION === undefined || Soup.MAJOR_VERSION === 2;

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
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
    let isDoubles = teams.some(function (t) { return t.isDoubles; })
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

    return {
        id: String(event.id || event.competitionId || event.uid || ""),
        tour: String(tour || "").toUpperCase(),
        tournament: event.name || event.shortName || "",
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
        link: link
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

function LiveTennisDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

LiveTennisDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.metadata = metadata;
        this.enableAtp = true;
        this.enableWta = true;
        this.showDoubles = true;
        this.refreshSeconds = 30;
        this.showCompleted = true;
        this.maxCompleted = 4;
        this.showUpcoming = false;
        this.maxUpcoming = 4;
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
        this.setHeader(_("Tennis Today"));
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
        this.setContent(this._root);
    },

    _label: function (text, styleClass, wrap, noEllipsize) {
        let label = new St.Label({
            text: text || "",
            style_class: styleClass || ""
        });
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
            if (m.tour === "ATP" && !this.enableAtp) {
                continue;
            }
            if (m.tour === "WTA" && !this.enableWta) {
                continue;
            }
            if (m.tour !== "ATP" && m.tour !== "WTA") {
                continue;
            }
            if (m.isDoubles && !this.showDoubles) {
                continue;
            }
            if (m.status === "Live") {
                live.push(m);
            } else if (m.status === "Finished") {
                finished.push(m);
            } else {
                upcoming.push(m);
            }
        }

        live = live.slice(0, this.maxLive || 12);
        if (this.showCompleted) {
            finished = finished.slice(0, this.maxCompleted || 0);
        } else {
            finished = [];
        }
        if (this.showUpcoming) {
            upcoming = upcoming.slice(0, this.maxUpcoming || 0);
        } else {
            upcoming = [];
        }
        return { live: live, finished: finished, upcoming: upcoming };
    },

    _render: function () {
        if (!this._root) {
            return;
        }
        this._root.destroy_all_children();
        this._root.style = "width: " + (this.deskletWidth || 420) + "px;";

        this._root.add_child(this._buildHeader());

        if (this._error && this._matches.length === 0) {
            this._root.add_child(this._label(this._error, "lt-error", true));
            return;
        }

        let groups = this._selectedMatches();
        let scroll = new St.ScrollView({
            style: "max-height: " + (this.maxHeight || 720) + "px;"
        });
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        scroll.overlay_scrollbars = true;

        let inner = new St.BoxLayout({ vertical: true });
        let any = false;

        if (groups.live.length) {
            inner.add_child(this._label(_("LIVE"), "lt-section-label"));
            this._appendGroupedMatches(inner, groups.live);
            any = true;
        }
        if (groups.finished.length) {
            inner.add_child(this._label(_("Recently finished"), "lt-section-label"));
            this._appendGroupedMatches(inner, groups.finished);
            any = true;
        }
        if (groups.upcoming.length) {
            inner.add_child(this._label(_("Upcoming"), "lt-section-label"));
            this._appendGroupedMatches(inner, groups.upcoming);
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

    _buildHeader: function () {
        let header = new St.BoxLayout({
            vertical: false,
            style_class: "lt-header"
        });

        let titleBox = new St.BoxLayout({ vertical: true, x_expand: true });
        titleBox.add_child(this._label(_("Tennis Today"), "lt-title"));
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
        let tourClass = "lt-tour-other";
        if (match.tour === "ATP") {
            tourClass = "lt-tour-atp";
        } else if (match.tour === "WTA") {
            tourClass = "lt-tour-wta";
        }
        row.add_child(this._label(match.tour, "lt-tour-badge " + tourClass));
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
        let nameLabel = this._label(name, nameClass);
        nameLabel.x_expand = true;
        row.add_child(nameLabel);

        if (team.seed) {
            row.add_child(this._label("(" + team.seed + ")", "lt-player-seed"));
        }
        if (team.country) {
            row.add_child(this._label(team.country, "lt-country"));
        }

        if (maxSets > 0 && team.linescores && team.linescores.length) {
            for (let i = 0; i < maxSets; i++) {
                let ls = team.linescores[i];
                let text = " ";
                let cls = "lt-set";
                if (ls && ls.value != null && ls.value !== "") {
                    text = String(ls.value);
                    if (ls.tiebreak) {
                        text += "(" + ls.tiebreak + ")";
                    }
                    if (ls.winner) {
                        cls += " lt-set-win";
                    }
                }
                row.add_child(this._label(text, cls, false, true));
            }
        } else if (team.score) {
            row.add_child(this._label(team.score, "lt-score-line"));
        }
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

    _fetch: function () {
        if (this._fetching || !this._httpSession) {
            return;
        }
        this._fetching = true;
        this._render();

        let message = Soup.Message.new("GET", ESPN_URL);
        try {
            message.request_headers.append("User-Agent", USER_AGENT);
            message.request_headers.append("Accept", "application/json");
        } catch (e) {
            global.logError(UUID + " header error: " + e);
        }

        if (IS_SOUP_2) {
            this._httpSession.queue_message(message, (session, msg) => {
                let body = null;
                if (msg && msg.status_code === 200 && msg.response_body) {
                    body = msg.response_body.data;
                }
                this._onBody(body, msg ? msg.status_code : 0);
            });
        } else {
            this._httpSession.send_and_read_async(message, Soup.MessagePriority.NORMAL, null, (session, result) => {
                let body = null;
                let status = 0;
                try {
                    status = message.get_status();
                    if (status === 200) {
                        let bytes = this._httpSession.send_and_read_finish(result);
                        body = ByteArray.toString(bytes.get_data());
                    }
                } catch (e) {
                    global.logError(UUID + " fetch error: " + e);
                }
                this._onBody(body, status);
            });
        }
    },

    _onBody: function (body, status) {
        this._fetching = false;
        if (!body) {
            this._error = _("Could not fetch scores") + (status ? " (" + status + ")" : "");
            this._render();
            return;
        }
        try {
            let json = JSON.parse(body);
            this._matches = parseEspnHeader(json);
            this._error = null;
            let now = new Date();
            this._updatedAt = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch (e) {
            this._error = _("Invalid score data");
            global.logError(UUID + " parse error: " + e);
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
    return new LiveTennisDesklet(metadata, deskletId);
}
