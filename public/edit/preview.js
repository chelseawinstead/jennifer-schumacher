/* -----------------------------------------------------------------------------
 * Live site panel for the CMS.
 *
 * Sveltia's built-in preview pane is disabled in config.yml (editor.preview:
 * false). This docks the REAL website beside the edit form instead — it's the
 * actual page in an iframe, so it is pixel-accurate by definition and can never
 * drift from the design. Refreshes on demand and after each save.
 * -------------------------------------------------------------------------- */
(function () {
  var PAGES = [
    { label: 'Home', path: '/' },
    { label: 'About', path: '/about' },
    { label: 'Buy', path: '/buy' },
    { label: 'Sell', path: '/sell' },
    { label: 'Listings', path: '/listings' },
    { label: 'Journal', path: '/journal' },
  ];

  var open = true;
  var current = PAGES[0].path;
  var root, frame, select;

  function css() {
    var s = document.createElement('style');
    s.textContent = [
      '#jsLive{position:fixed;top:0;right:0;bottom:0;width:46vw;min-width:380px;',
      'background:#fff;border-left:1px solid #d8d5ce;z-index:2147483000;display:flex;',
      'flex-direction:column;box-shadow:-14px 0 34px -26px rgba(0,20,45,.5);',
      "font-family:'Jost',system-ui,sans-serif;transition:transform .18s ease}",
      '#jsLive.closed{transform:translateX(calc(100% - 40px))}',
      '#jsLiveBar{display:flex;align-items:center;gap:10px;padding:9px 12px;',
      'background:#002349;color:#fff;flex:0 0 auto}',
      '#jsLiveBar b{font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:500}',
      '#jsLive select{font:inherit;font-size:12.5px;padding:5px 8px;border:1px solid rgba(255,255,255,.3);',
      'background:rgba(255,255,255,.08);color:#fff;border-radius:3px}',
      '#jsLive select option{color:#14181d}',
      '#jsLive button{font:inherit;font-size:11px;letter-spacing:.12em;text-transform:uppercase;',
      'padding:6px 11px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;',
      'cursor:pointer;border-radius:3px}',
      '#jsLive button:hover{background:rgba(255,255,255,.14)}',
      '#jsLiveToggle{margin-left:auto}',
      '#jsLive iframe{flex:1;width:100%;border:0;background:#fff}',
      '#jsLiveNote{font-size:11px;color:#9db4cb;padding:0 12px 0 0}',
      // narrow windows: keep the panel, just make it slimmer
      '@media(max-width:1100px){#jsLive{width:56vw;min-width:0}}',
      '@media(max-width:720px){#jsLive{width:82vw}}',
    ].join('');
    document.head.appendChild(s);
  }

  function build() {
    root = document.createElement('div');
    root.id = 'jsLive';

    var bar = document.createElement('div');
    bar.id = 'jsLiveBar';

    var title = document.createElement('b');
    title.textContent = 'Live site';

    select = document.createElement('select');
    PAGES.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.path;
      o.textContent = p.label;
      select.appendChild(o);
    });
    select.addEventListener('change', function () {
      current = select.value;
      reload();
    });

    var refresh = document.createElement('button');
    refresh.textContent = 'Refresh';
    refresh.addEventListener('click', reload);

    var note = document.createElement('span');
    note.id = 'jsLiveNote';
    note.textContent = 'updates ~30s after saving';

    var toggle = document.createElement('button');
    toggle.id = 'jsLiveToggle';
    toggle.textContent = 'Hide';
    toggle.addEventListener('click', function () {
      open = !open;
      root.classList.toggle('closed', !open);
      toggle.textContent = open ? 'Hide' : 'Show';
    });

    bar.appendChild(title);
    bar.appendChild(select);
    bar.appendChild(refresh);
    bar.appendChild(note);
    bar.appendChild(toggle);

    frame = document.createElement('iframe');
    frame.src = current;
    frame.setAttribute('title', 'Live website');

    root.appendChild(bar);
    root.appendChild(frame);
    document.body.appendChild(root);
  }

  function reload() {
    // cache-bust so a fresh deploy shows immediately
    frame.src = current + (current.indexOf('?') > -1 ? '&' : '?') + 'r=' + Date.now();
  }

  function boot() {
    if (!document.body) return setTimeout(boot, 100);
    css();
    build();
    // re-check a little after a save; the rebuild takes ~30s
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && /save/i.test(t.textContent || '') && (t.tagName === 'BUTTON' || t.closest('button'))) {
        setTimeout(reload, 35000);
      }
    }, true);
  }

  boot();
})();
