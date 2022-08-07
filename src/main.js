import mount from "mithril/mount";
import { request } from "mithril/request";
import hyperscript from "mithril/hyperscript";
import { handleCSRFProtection } from "./csrf";

// Happily stolen from Mithril to make the bundle size smaller.
var m = function m() {
  return hyperscript.apply(this, arguments);
};
m.request = request;
m.mount = mount;

let defaultState = {
  showVerbose: false,
  onlyShowPepp: false,
  ordering: "lexical",
  showType: 0,
  filterByDay: -1, // Not active by default.
};

let state = defaultState;
try {
  let s = JSON.parse(window.localStorage.getItem("knutpunkt-program"));
  if (s != null) {
    state = s;
  }
} catch {}

var Program = {};
var EventTypes = [];

var orderProgram = function () {
  var cmpHelper = function (propFun) {
    return function (a, b) {
      var p1 = propFun(a);
      var p2 = propFun(b);
      if (p1 < p2) {
        return -1;
      } else if (p1 > p2) {
        return 1;
      } else {
        return 0;
      }
    };
  };
  var cmp =
    state.ordering == "lexical"
      ? cmpHelper(function (p) {
          return p.name;
        })
      : cmpHelper(function (p) {
          return p.schevents
            .map(function (s) {
              return s.start.getTime();
            })
            .reduce(function (acc, v) {
              return Math.min(acc, v);
            }, 9007199254740991);
        });
  for (var k in Program) {
    if (Program.hasOwnProperty(k)) {
      Program[k].sort(cmp);
    }
  }
};

var Main = {
  view: function () {
    function save() {
      window.localStorage.setItem("knutpunkt-program", JSON.stringify(state));
    }
    function verboseFun(isVerbose) {
      return function (e) {
        e.preventDefault();
        state.showVerbose = isVerbose;
        save();
      };
    }
    function peppFilterFun(isOnlyPepp) {
      return function (e) {
        e.preventDefault();
        state.onlyShowPepp = isOnlyPepp;
        save();
      };
    }
    function orderFun(ordering) {
      return function (e) {
        e.preventDefault();
        state.ordering = ordering;
        save();
        orderProgram(state);
      };
    }
    function typeFun(typeId) {
      return function (e) {
        e.preventDefault();
        state.showType = typeId;
        save();
      };
    }
    function dayFun(dayId) {
      return function (e) {
        e.preventDefault();
        state.filterByDay = dayId;
        save();
      };
    }
    function peppMe(programItem) {
      return function (e) {
        e.preventDefault();
        m.request(
          handleCSRFProtection({
            method: programItem.pepp ? "DELETE" : "POST",
            url: document.config.peppUrl,
            body: programItem.pk,
          })
        ).then((r) => {
          programItem.pepp = r.pepp;
        });
      };
    }
    function renderTheProgram() {
      var et = EventTypes.find(function (e) {
        return e.pk == state.showType;
      });
      return et && et != undefined
        ? renderProgramItems(et)
        : [].concat.apply(
            [],
            EventTypes.map(function (e) {
              return renderProgramItems(e);
            })
          );
    }

    return m(
      "main#program",
      [
        m("div.side-by-side", [
          m(
            "ul.button-list",
            [
              { label: "Lista", prop: false },
              { label: "Beskrivningar", prop: true },
            ].map(function (x) {
              return m("li", [
                m(
                  "button",
                  {
                    onclick: verboseFun(x.prop),
                    class: state.showVerbose == x.prop ? "active glow" : null,
                  },
                  x.label
                ),
              ]);
            })
          ),
          document.config.loggedIn
            ? m(
                "ul.button-list",
                [
                  { label: "Allt", prop: false },
                  { label: "Bara pepp", prop: true },
                ].map(function (x) {
                  return m("li", [
                    m(
                      "button",
                      {
                        onclick: peppFilterFun(x.prop),
                        class:
                          state.onlyShowPepp == x.prop ? "active glow" : null,
                      },
                      x.label
                    ),
                  ]);
                })
              )
            : null,
          m(
            "ul.button-list",
            [
              { label: "Bokstavsordning", prop: "lexical" },
              { label: "Tidsordning", prop: "time" },
            ].map(function (x) {
              return m("li", [
                m(
                  "button",
                  {
                    onclick: orderFun(x.prop),
                    class: state.ordering == x.prop ? "active glow" : null,
                  },
                  x.label
                ),
              ]);
            })
          ),
        ]),
        m(
          "ul.button-list",
          [
            m("li#all-types", [
              m(
                "button",
                {
                  onclick: typeFun(0),
                  class: state.showType == 0 ? "active glow" : null,
                },
                "Alla"
              ),
            ]),
          ].concat(
            EventTypes.map(function (et) {
              return m("li", [
                m(
                  "button." + et.slug,
                  {
                    onclick: typeFun(et.pk),
                    class: state.showType == et.pk ? "active glow" : null,
                  },
                  et.name
                ),
              ]);
            })
          )
        ),

        m(
          "ul.button-list",
          [
            { label: "Alla dagar", idx: -1 },
            { label: "Fredag", idx: 5 },
            { label: "Lördag", idx: 6 },
            { label: "Söndag", idx: 0 },
          ].map(function (day) {
            return m("li", [
              m(
                "button",
                {
                  onclick: dayFun(day.idx),
                  class: state.filterByDay == day.idx ? "active glow" : null,
                },
                day.label
              ),
            ]);
          })
        ),
      ].concat(renderTheProgram())
    );
    function renderProgramItems(eventType) {
      var dayNames = [
        "söndag",
        "måndag",
        "tisdag",
        "onsdag",
        "torsdag",
        "fredag",
        "lördag",
      ];
      function zeroPadInt(n) {
        return ("0" + n).slice(-2);
      }
      function formatTime(d) {
        return zeroPadInt(d.getHours()) + ":" + zeroPadInt(d.getMinutes());
      }
      var programItems = (Program[eventType.pk] || [])
        .filter(function (pi) {
          return (
            (state.filterByDay != -1
              ? pi.schevents
                  .map(function (s) {
                    return s.start.getDay();
                  })
                  .indexOf(state.filterByDay) != -1
              : true) &&
            (document.config.loggedIn && state.onlyShowPepp ? pi.pepp : true)
          );
        })
        .map(function (pi) {
          return m(
            "li",
            [
              m("a.event-link", { href: pi.url }, pi.name),
              pi.pepp && !state.onlyShowPepp ? " ★" : null,
            ]
              .concat(
                state.showVerbose
                  ? [
                      m("p.arr", pi.organizers),
                      m("p.besk", pi.description),
                      m("p.vad", [m("span.hjarta", "♥"), pi.whatsinitforme]),
                      m("p.taggar", pi.tags.join(", ")),
                    ]
                  : []
              )
              .concat(
                pi.schevents
                  ? [
                      m(
                        "ul",
                        pi.schevents.map(function (s) {
                          return m("li", [
                            dayNames[s.start.getDay()].substring(0, 3) +
                              " " +
                              formatTime(s.start) +
                              " – " +
                              formatTime(s.stop) +
                              " " +
                              s.location,
                          ]);
                        })
                      ),
                    ]
                  : []
              )
              .concat(
                state.showVerbose && document.config.loggedIn
                  ? [
                      m(
                        "p",
                        m(
                          "button.pure-button",
                          { onclick: peppMe(pi) },
                          pi.pepp ? "Opeppa!" : "Peppa!"
                        )
                      ),
                    ]
                  : []
              )
          );
        });
      if (programItems.length > 0) {
        return [m("h2.typeheader", eventType.name), m("ul", programItems)];
      }
      return [];
    }
  },
};

m.mount(document.config.attachTo, Main);
m.request({
  method: "GET",
  url: document.config.programApiUrl,
  deserialize: function (pies) {
    return pies.map(function (p) {
      p.schevents = p.schevents.map(function (s) {
        return {
          start: new Date(s.start),
          stop: new Date(s.stop),
          location: s.location,
        };
      });
      p.schevents.sort(function (a, b) {
        return a.start.getTime() - b.start.getTime();
      });
      return p;
    });
  },
}).then((r) => {
  // Group by event type.
  Program = r.reduce(function (p, v) {
    if (!p[v.type]) {
      p[v.type] = [];
    }
    p[v.type].push(v);
    return p;
  }, {});
  orderProgram();
});
m.request({
  method: "GET",
  url: document.config.eventTypeApiUrl,
}).then((r) => {
  EventTypes = r;
});
