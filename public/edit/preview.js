/* -----------------------------------------------------------------------------
 * Live site companion window.
 *
 * An overlay panel can't work here: the CMS lays itself out against the browser
 * viewport, so it slides underneath anything docked over it. Instead this opens
 * the real site in its own window, which you can park beside the editor or drag
 * to a second screen. It follows whichever page you're editing.
 * -------------------------------------------------------------------------- */
(function () {
  var ENTRY_TO_PATH = { home: '/', about: '/about', site: '/' };
  var LABEL = { '/': 'Home', '/about': 'About' };

  var win = null;
  var current = '/';
  var btn, label;

  function css() {
    var s = document.createElement('style');
    s.textContent = [
      '#jsLiveBtn{position:fixed;right:18px;bottom:18px;z-index:2147483000;',
      'display:flex;align-items:center;gap:10px;background:#002349;color:#fff;',
      'border:none;border-radius:999px;padding:13px 20px;cursor:pointer;',
      "font-family:'Jost',system-ui,sans-serif;font-size:12px;letter-spacing:.14em;",
      'text-transform:uppercase;box-shadow:0 10px 26px -10px rgba(0,20,45,.55)}',
      '#jsLiveBtn:hover{background:#013a70}',
      '#jsLiveBtn span.dot{width:7px;height:7px;border-radius:50%;background:#7fd48b;display:block}',
      '#jsLiveBtn span.dot.off{background:#9db4cb}',
    ].join('');
    document.head.appendChild(s);
  }

  function pathFromHash() {
    var m = (location.hash || '').match(/entries\/([a-z0-9_-]+)/i);
    return m && ENTRY_TO_PATH[m[1]] ? ENTRY_TO_PATH[m[1]] : null;
  }

  function isOpen() {
    try { return win && !win.closed; } catch (e) { return false; }
  }

  function render() {
    label.textContent = isOpen()
      ? 'Live site · ' + (LABEL[current] || current)
      : 'Open live site';
    btn.firstChild.className = isOpen() ? 'dot' : 'dot off';
  }

  function openWin() {
    // roughly half the screen, parked on the right
    var w = Math.max(520, Math.round(screen.availWidth * 0.46));
    var h = screen.availHeight;
    var left = screen.availWidth - w;
    win = window.open(current, 'jsLiveSite',
      'width=' + w + ',height=' + h + ',left=' + left + ',top=0');
    render();
  }

  function go(path, force) {
    current = path;
    if (isOpen()) {
      try { win.location.replace(path + '?r=' + Date.now()); } catch (e) {}
      if (force) { try { win.focus(); } catch (e) {} }
    }
    render();
  }

  function boot() {
    if (!document.body) return setTimeout(boot, 100);
    css();

    btn = document.createElement('button');
    btn.id = 'jsLiveBtn';
    var dot = document.createElement('span');
    dot.className = 'dot off';
    label = document.createElement('span');
    btn.appendChild(dot);
    btn.appendChild(label);
    btn.addEventListener('click', function () {
      if (isOpen()) { try { win.focus(); } catch (e) {} go(current, true); }
      else openWin();
    });
    document.body.appendChild(btn);

    var p = pathFromHash();
    if (p) current = p;
    render();

    // follow the page being edited
    setInterval(function () {
      var np = pathFromHash();
      if (np && np !== current) go(np);
      render();
    }, 800);

    // refresh once the rebuild has landed
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('button');
      if (b && /save/i.test(b.textContent || '')) {
        setTimeout(function () { go(current); }, 35000);
      }
    }, true);
  }

  boot();
})();
