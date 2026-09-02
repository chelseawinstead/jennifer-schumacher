/*
 * Jennifer Schumacher — site behaviour.
 *
 * Replaces the React/Babel runtime the Claude Design export shipped with.
 * Every page renders completely without this file; it only adds the three
 * interactive pieces: the contact modals, the click-to-play property film,
 * and the footer's copy-email link.
 */
(function () {
  "use strict";

  var cfgEl = document.getElementById("page-config");
  var cfg = {};
  try { cfg = cfgEl ? JSON.parse(cfgEl.textContent) : {}; } catch (e) {}

  var state = {
    open: false, sent: false, error: false, playing: false, copied: false,
    first: "", last: "", email: "", phone: ""
  };

  // ---- derived conditions, matching the export's renderVals() ------------
  var conditions = {
    modalOpen: function () { return state.open && !state.sent; },
    modalSent: function () { return state.open && state.sent; },
    showError: function () { return state.error; },
    copied: function () { return state.copied; },
    videoPlaying: function () { return state.playing; },
    notVideoPlaying: function () { return !state.playing; },
    videoNotPlaying: function () { return !state.playing; },
    // The listing heroes name the same two states videoOpen/videoClosed.
    videoOpen: function () { return state.playing; },
    videoClosed: function () { return !state.playing; }
  };

  var texts = {
    thankName: function () {
      return state.first.trim() ? "Thank you, " + state.first.trim() + "." : "Thank you.";
    }
  };

  function render() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-if]"), function (el) {
      var test = conditions[el.getAttribute("data-if")];
      if (!test) return;
      if (test()) el.setAttribute("data-open", "");
      else el.removeAttribute("data-open");
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-text]"), function (el) {
      var fn = texts[el.getAttribute("data-text")];
      if (fn) el.textContent = fn();
    });

    // Video embeds only load once their block is actually on screen, so no
    // visitor touches YouTube unless they press play.
    Array.prototype.forEach.call(document.querySelectorAll("[data-src-lazy]"), function (el) {
      var block = el.closest("[data-if]");
      if (block && !block.hasAttribute("data-open")) return;
      el.setAttribute("src", el.getAttribute("data-src-lazy"));
      el.removeAttribute("data-src-lazy");
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-src-from]"), function (el) {
      var block = el.closest("[data-if]");
      if (block && !block.hasAttribute("data-open")) return;
      var url = cfg[el.getAttribute("data-src-from")];
      if (url && el.getAttribute("src") !== url) el.setAttribute("src", url);
    });

    document.body.style.overflow = state.open ? "hidden" : "";
  }

  // ---- phone formatting, lifted from the export -------------------------
  function formatPhone(value) {
    var d = value.replace(/\D/g, "").slice(0, 10);
    if (d.length > 6) return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
    if (d.length > 3) return "(" + d.slice(0, 3) + ") " + d.slice(3);
    if (d.length > 0) return "(" + d;
    return d;
  }

  function submit() {
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim());
    var phoneOk = !cfg.phoneRequired || state.phone.replace(/\D/g, "").length === 10;
    if (!state.first.trim() || !state.last.trim() || !emailOk || !phoneOk) {
      state.error = true;
      render();
      return;
    }
    var lines = [];
    // A showing request that does not say which home it is about is no use to
    // anyone; listing pages put their address in the page config for this.
    if (cfg.listing) lines.push("Listing: " + cfg.listing, "");
    lines.push("First name: " + state.first, "Last name: " + state.last,
               "Email: " + state.email);
    if (cfg.phoneRequired) lines.push("Phone: " + state.phone);
    window.open("mailto:" + cfg.mailTo +
      "?subject=" + encodeURIComponent(cfg.mailSubject || "") +
      "&body=" + encodeURIComponent(lines.join("\n")), "_blank");
    state.sent = true;
    state.error = false;
    render();
  }

  var copyTimer;
  function copyEmail(el) {
    var addr = (el.getAttribute("href") || "").replace(/^mailto:/, "");
    if (!addr || !navigator.clipboard || !navigator.clipboard.writeText) return;
    navigator.clipboard.writeText(addr).then(function () {
      state.copied = true;
      render();
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { state.copied = false; render(); }, 2600);
    }).catch(function () {});
  }

  // YouTube picks a stream from the iframe's size on load, which on a 21/9
  // hero lands well below the source. The export nudged it back up to the
  // best available for the first few seconds; this does the same.
  function forceQuality() {
    var frame = document.querySelector('iframe[title="Property video"]');
    if (!frame || !frame.contentWindow) return;
    var tries = 0;
    var timer = setInterval(function () {
      if (++tries > 10 || !frame.contentWindow) { clearInterval(timer); return; }
      ["hd2160", "highres", "hd1440", "hd1080"].forEach(function (q) {
        frame.contentWindow.postMessage(JSON.stringify(
          { event: "command", func: "setPlaybackQuality", args: [q] }), "*");
      });
    }, 1200);
  }

  function play(e) {
    e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
    state.playing = true;
    render();
    forceQuality();
  }

  // ---- handlers ---------------------------------------------------------
  var handlers = {
    openModal: function (e) {
      e.preventDefault();
      state.open = true; state.sent = false; state.error = false;
      render();
    },
    closeModal: function (e) {
      if (e) e.preventDefault();
      state.open = false;
      render();
    },
    stop: function (e) { e.stopPropagation(); },
    submit: function (e) { e.preventDefault(); submit(); },
    playVideo: play,
    openVideo: play,
    closeVideo: function (e) {
      e.stopPropagation();
      state.playing = false;
      render();
    },
    copyEmail: function (e) { copyEmail(e.currentTarget); }
  };

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-on-click]");
    if (!el) return;
    var fn = handlers[el.getAttribute("data-on-click")];
    if (fn) fn.call(el, e);
  });

  document.addEventListener("input", function (e) {
    var el = e.target.closest("[data-model]");
    if (!el) return;
    var key = el.getAttribute("data-model");
    if (key === "phone") el.value = formatPhone(el.value);
    state[key] = el.value;
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && state.open) { state.open = false; render(); }
  });

  render();
})();
