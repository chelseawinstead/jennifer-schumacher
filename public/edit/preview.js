/* -----------------------------------------------------------------------------
 * Live site panel for the CMS.
 *
 * Sveltia's built-in preview pane is disabled in config.yml. This docks the REAL
 * website beside the edit form — pixel-accurate by definition, and it follows
 * whichever page you're editing.
 * -------------------------------------------------------------------------- */
(function () {
  var WIDTH = '42vw';

  // Which live page corresponds to each CMS entry
  var ENTRY_TO_PATH = {
    home: '/',
    about: '/about',
    site: '/',        // contact/footer details show on every page
  };

  var PAGES = [
    { label: 'Home', path: '/' },
    { label: 'About', path: '/about' },
    { label: 'Buy', path: '/buy' },
    { label: 'Sell', path: '/sell' },
    { label: 'Listings', path: '/listings' },
    { label: 'Journal', path: '/journal' },
  ];

  var open = true;
  var current = '/';
  var manual = false;           // true once the user picks from the dropdown
  var root, frame, select, toggle;

  function css() {
    var s = document.createElement('style');
    s.textContent = [
      ':root{--jsPanel:' + WIDTH + '}',
      // squeeze the CMS into the remaining space instead of hiding under the panel
      'body.jsLiveOpen > *:not(#jsLive){width:calc(100vw - var(--jsPanel)) !important;',
      'right:auto !important;max-width:calc(100vw - var(--jsPanel)) !important}',
      '#jsLive{position:fixed;top:0;right:0;bottom:0;width:var(--jsPanel);',
      'background:#fff;border-left:1px solid #d8d5ce;z-index:2147483000;display:flex;',
      'flex-direction:column;box-shadow:-14px 0 34px -26px rgba(0,20,45,.5);',
      "font-family:'Jost',system-ui,sans-serif;transition:transform .18s ease}",
      '#jsLive.closed{transform:translateX(calc(100% - 42px))}',
      '#jsLiveBar{display:flex;align-items:center;gap:9px;padding:9px 11px;',
      'background:#002349;color:#fff;flex:0 0 auto;flex-wrap:nowrap}',
      '#jsLiveBar b{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;',
      'font-weight:500;white-space:nowrap}',
      '#jsLive select{font:inherit;font-size:12px;padding:5px 7px;border:1px solid rgba(255,255,255,.3);',
      'background:rgba(255,255,255,.08);color:#fff;border-radius:3px}',
      '#jsLive select option{color:#14181d}',
      '#jsLive button{font:inherit;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;',
      'padding:6px 10px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;',
      'cursor:pointer;border-radius:3px;white-space:nowrap}',
      '#jsLive button:hover{background:rgba(255,255,255,.14)}',
      '#jsLiveToggle{margin-left:auto}',
      '#jsLive iframe{flex:1;width:100%;border:0;background:#fff}',
      '@media(max-width:1200px){:root{--jsPanel:46vw}}',
    ].join('');
    document.head.appendChild(s);
  }

  function pathFromHash() {
    // Sveltia uses hash routing, e.g. #/collections/pages/entries/about
    var m = (location.hash || '').match(/entries\/([a-z0-9_-]+)/i);
    if (m && ENTRY_TO_PATH[m[1]]) return ENTRY_TO_PATH[m[1]];
    return null;
  }

  function syncToHash() {
    if (manual) return;
    var p = pathFromHash();
    if (p && p !== current) {
      current = p;
      if (select) select.value = p;
      reload();
    }
  }

  function reload() {
    frame.src = current + (current.indexOf('?') > -1 ? '&' : '?') + 'r=' + Date.now();
  }

  function setOpen(v) {
    open = v;
    root.classList.toggle('closed', !open);
    document.body.classList.toggle('jsLiveOpen', open);
    toggle.textContent = open ? 'Hide' : 'Show';
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
      manual = true;             // stop auto-following once they choose
      current = select.value;
      reload();
    });

    var refresh = document.createElement('button');
    refresh.textContent = 'Refresh';
    refresh.addEventListener('click', function () {
      manual = false;            // resume following the edited page
      var p = pathFromHash();
      if (p) { current = p; select.value = p; }
      reload();
    });

    toggle = document.createElement('button');
    toggle.id = 'jsLiveToggle';
    toggle.addEventListener('click', function () { setOpen(!open); });

    bar.appendChild(title);
    bar.appendChild(select);
    bar.appendChild(refresh);
    bar.appendChild(toggle);

    frame = document.createElement('iframe');
    frame.setAttribute('title', 'Live website');

    root.appendChild(bar);
    root.appendChild(frame);
    document.body.appendChild(root);

    var p = pathFromHash();
    if (p) current = p;
    select.value = current;
    frame.src = current;
    setOpen(true);
  }

  function boot() {
    if (!document.body) return setTimeout(boot, 100);
    css();
    build();

    window.addEventListener('hashchange', syncToHash);
    setInterval(syncToHash, 800);   // hash routing doesn't always fire the event

    // refresh once the rebuild has had time to land
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('button');
      if (b && /save/i.test(b.textContent || '')) setTimeout(reload, 35000);
    }, true);
  }

  boot();
})();
