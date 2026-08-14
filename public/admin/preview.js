/* -----------------------------------------------------------------------------
 * Live preview pane for Sveltia CMS.
 * Renders Jennifer's homepage beside the edit form, updating as she types.
 * Loads the SAME stylesheet the live site uses (/styles/site.css), so fonts,
 * colours and the striped photo-placeholder pattern always match the real page.
 * -------------------------------------------------------------------------- */
(function () {
  function boot() {
    var CMS = window.CMS;
    var React = window.React;
    if (!CMS || !React) return setTimeout(boot, 120);

    var el = React.createElement;

    // the real site stylesheet — single source of truth for type + placeholders
    CMS.registerPreviewStyle('/styles/site.css');
    CMS.registerPreviewStyle(
      "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Jost:wght@300;400;500&display=swap');" +
      'body{margin:0;background:#fff}' +
      '.pv{max-width:1440px;margin:0 auto;background:#fff;transform-origin:top left}' +
      '.pv-note{background:#fffdf5;border-bottom:1px solid #e8dfc4;padding:8px 14px;' +
        "font:400 11px/1.5 'Jost',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#8a6516}",
      { raw: true }
    );

    var SERIF = "'Cormorant Garamond', serif";

    function img(getAsset, path, style, alt) {
      if (!path) return null;
      var a = getAsset(path);
      return el('img', { src: a ? a.toString() : path, alt: alt || '', style: style });
    }

    function placeholder(label) {
      return el('div', { className: 'ph', style: { position: 'absolute', inset: 0 } },
        el('span', { className: 'phl' }, label || 'Photo needed'));
    }

    // ---- HOMEPAGE ----------------------------------------------------------
    var HomePreview = function (props) {
      var d = props.entry.getIn(['data']);
      d = d && d.toJS ? d.toJS() : (d || {});
      var getAsset = props.getAsset;

      var hero = d.hero || {}, why = d.why || {}, stats = d.stats || [],
          comm = d.communities || {}, list = d.listings || {},
          tst = d.testimonials || {}, cta = d.cta || {}, split = d.split || [];

      return el('div', { className: 'pv' },
        el('div', { className: 'pv-note' }, 'Live preview — updates as you type'),

        // hero
        el('header', { style: { display: 'grid', gridTemplateColumns: '1.05fr .95fr' } },
          el('div', { style: { padding: '62px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' } },
            el('span', { style: { fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#002349', marginBottom: 24 } }, hero.kicker),
            el('h1', { style: { fontFamily: SERIF, fontWeight: 400, fontSize: 58, lineHeight: 1.04, color: '#14181d', margin: '0 0 24px' } },
              hero.headline_line1, el('br'),
              el('em', { style: { fontStyle: 'italic', color: '#002349' } }, hero.headline_emphasis)),
            el('p', { style: { fontSize: 16, lineHeight: 1.75, color: '#55585c', maxWidth: 460, margin: 0, fontWeight: 300 } }, hero.body)),
          el('div', { style: { minHeight: 420, position: 'relative', overflow: 'hidden' } },
            img(getAsset, hero.image, { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', display: 'block' }, hero.image_alt)
              || placeholder('Portrait photo'))),

        // buyer / seller
        el('section', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #ececec' } },
          split.map(function (c, i) {
            return el('div', { key: i, style: { padding: '44px', background: i ? '#f6f5f2' : '#fff', borderRight: i ? 'none' : '1px solid #ececec' } },
              el('span', { style: { fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: '#9a968d' } }, c.kicker),
              el('h3', { style: { fontFamily: SERIF, fontWeight: 400, fontSize: 32, color: '#14181d', margin: '12px 0' } }, c.title),
              el('p', { style: { fontSize: 14, lineHeight: 1.7, color: '#6b6b66', fontWeight: 300, margin: 0 } }, c.body));
          })),

        // why
        el('section', { style: { padding: '64px 44px', borderTop: '1px solid #ececec' } },
          el('div', { style: { textAlign: 'center', marginBottom: 44 } },
            el('span', { style: { fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#002349' } }, why.kicker),
            el('h2', { style: { fontFamily: SERIF, fontWeight: 400, fontSize: 38, color: '#14181d', margin: '12px 0 0' } }, why.heading)),
          el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 40 } },
            (why.items || []).map(function (it, i) {
              return el('div', { key: i },
                el('div', { style: { fontFamily: SERIF, fontSize: 26, color: '#002349' } }, it.number),
                el('div', { style: { height: 1, background: '#e0ded7', margin: '14px 0' } }),
                el('h4', { style: { fontFamily: SERIF, fontWeight: 500, fontSize: 20, color: '#14181d', margin: '0 0 10px' } }, it.title),
                el('p', { style: { fontSize: 14, lineHeight: 1.7, color: '#6b6b66', fontWeight: 300, margin: 0 } }, it.body));
            }))),

        // stats
        el('section', { style: { background: '#002349', color: '#fff', padding: '54px 44px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 30 } },
          stats.map(function (s, i) {
            return el('div', { key: i, style: { textAlign: 'center', borderLeft: i ? '1px solid rgba(255,255,255,.14)' : 'none' } },
              el('div', { style: { fontFamily: SERIF, fontSize: 44, lineHeight: 1 } }, s.value),
              el('div', { style: { fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: '#9db4cb', marginTop: 12 } }, s.label));
          })),

        // communities
        el('section', { style: { padding: '64px 44px 54px' } },
          el('div', { style: { marginBottom: 30 } },
            el('span', { style: { fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#002349' } }, comm.kicker),
            el('h2', { style: { fontFamily: SERIF, fontWeight: 400, fontSize: 36, color: '#14181d', margin: '12px 0 0' } }, comm.heading)),
          el('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gridAutoRows: 190, gap: 16 } },
            el('div', { style: { gridRow: 'span 2', position: 'relative', overflow: 'hidden' } },
              img(getAsset, (comm.featured || {}).image, { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' })
                || placeholder((comm.featured || {}).placeholder),
              el('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,20,45,0) 38%, rgba(0,20,45,.74) 100%)' } }),
              el('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24 } },
                el('div', { style: { fontFamily: SERIF, fontSize: 28, color: '#fff', lineHeight: 1 } }, (comm.featured || {}).name),
                el('div', { style: { fontSize: 12, color: 'rgba(255,255,255,.85)', marginTop: 8, fontWeight: 300, lineHeight: 1.6 } }, (comm.featured || {}).blurb))),
            (comm.others || []).map(function (c, i) {
              return el('div', { key: i, style: { gridColumn: c.span ? 'span 2' : 'auto', position: 'relative', overflow: 'hidden' } },
                img(getAsset, c.image, { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' })
                  || placeholder(c.placeholder),
                el('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,20,45,0) 45%, rgba(0,20,45,.64) 100%)' } }),
                el('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 } },
                  el('div', { style: { fontFamily: SERIF, fontSize: 19, color: '#fff', lineHeight: 1 } }, c.name),
                  el('div', { style: { fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.8)', marginTop: 5 } }, c.sub)));
            }))),

        // listings
        el('section', { style: { padding: '40px 44px 64px', background: '#f6f5f2' } },
          el('div', { style: { marginBottom: 30 } },
            el('span', { style: { fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#002349' } }, list.kicker),
            el('h2', { style: { fontFamily: SERIF, fontWeight: 400, fontSize: 36, color: '#14181d', margin: '12px 0 0' } }, list.heading)),
          el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 } },
            (list.items || []).map(function (p, i) {
              var placeholderAddress = (p.address || '').trim() === 'Address line';
              return el('div', { key: i, style: { background: '#fff' } },
                el('div', { style: { aspectRatio: '4/3', overflow: 'hidden', position: 'relative' } },
                  img(getAsset, p.image, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }) || placeholder('Property photo')),
                el('div', { style: { padding: '16px 18px 20px' } },
                  el('div', { style: { fontFamily: SERIF, fontSize: 22, color: '#14181d' } }, p.price),
                  el('div', { style: { fontSize: 13, color: placeholderAddress ? '#8f2c2c' : '#6b6b66', margin: '5px 0 10px' } },
                    (p.address || '') + ' · ' + (p.city || ''),
                    placeholderAddress ? el('span', { style: { display: 'block', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 4 } }, '← placeholder, needs a real address') : null),
                  el('div', { style: { fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9a968d' } }, p.specs)));
            }))),

        // testimonials
        el('section', { style: { padding: '64px 44px' } },
          el('div', { style: { textAlign: 'center', marginBottom: 36 } },
            el('span', { style: { fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#002349' } }, tst.kicker),
            el('h2', { style: { fontFamily: SERIF, fontWeight: 400, fontSize: 38, color: '#14181d', margin: '12px 0 10px' } }, tst.heading),
            el('div', { style: { fontSize: 12, color: '#6b6b66' } }, '★★★★★  ' + (tst.rating_line || ''))),
          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, maxWidth: 1000, margin: '0 auto' } },
            (tst.items || []).map(function (t, i) {
              return el('blockquote', { key: i, style: { margin: 0, borderTop: '2px solid #002349', paddingTop: 18 } },
                el('p', { style: { fontFamily: SERIF, fontSize: 20, lineHeight: 1.5, color: '#24272b', fontStyle: 'italic', margin: '0 0 14px' } }, t.quote),
                el('footer', { style: { fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: '#9a968d' } }, (t.author || '') + ' · ★★★★★'));
            }))),

        // cta
        el('section', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } },
          el('div', { style: { minHeight: 320, position: 'relative', overflow: 'hidden' } },
            img(getAsset, cta.image, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }) || placeholder('Photo')),
          el('div', { style: { background: '#002349', color: '#fff', padding: '62px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' } },
            el('span', { style: { fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#9db4cb', marginBottom: 18 } }, cta.kicker),
            el('h2', { style: { fontFamily: SERIF, fontWeight: 400, fontSize: 40, lineHeight: 1.08, margin: '0 0 18px' } }, cta.heading),
            el('p', { style: { fontSize: 15, lineHeight: 1.7, color: '#c6d3df', fontWeight: 300, maxWidth: 420, margin: 0 } }, cta.body)))
      );
    };

    // ---- SITE-WIDE DETAILS -------------------------------------------------
    var SitePreview = function (props) {
      var d = props.entry.getIn(['data']);
      d = d && d.toJS ? d.toJS() : (d || {});
      var bad = (d.license_number || '') === 'SA000000';

      return el('div', { className: 'pv' },
        el('div', { className: 'pv-note' }, 'Footer preview — appears on every page'),
        el('footer', { style: { background: '#0b1620', color: '#8ca0b3', padding: '48px 44px 28px' } },
          el('div', { style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.1fr', gap: 30, paddingBottom: 32, borderBottom: '1px solid rgba(255,255,255,.1)' } },
            el('div', null,
              el('div', { style: { fontFamily: SERIF, fontSize: 19, letterSpacing: '.2em', color: '#fff', marginBottom: 12 } }, (d.name || '').toUpperCase()),
              el('p', { style: { fontSize: 13, lineHeight: 1.7, fontWeight: 300, margin: 0, maxWidth: 300 } }, d.footer_blurb)),
            el('div', null,
              el('div', { style: { fontSize: 10, letterSpacing: '.26em', textTransform: 'uppercase', color: '#5f7488', marginBottom: 14 } }, 'Contact'),
              el('div', { style: { fontSize: 13, fontWeight: 300, lineHeight: 2 } },
                d.phone_display, el('br'), d.email, el('br'), d.address_line1, el('br'), d.address_line2)),
            el('div', null,
              el('div', { style: { fontSize: 10, letterSpacing: '.26em', textTransform: 'uppercase', color: '#5f7488', marginBottom: 14 } }, 'Brokerage'),
              el('p', { style: { fontSize: 13, lineHeight: 1.7, fontWeight: 300, margin: 0 } }, d.brokerage_disclosure))),
          el('div', { style: { display: 'flex', justifyContent: 'space-between', paddingTop: 20, fontSize: 11, letterSpacing: '.1em', color: '#5f7488' } },
            el('span', null, '© ' + (d.copyright_year || '') + ' ' + (d.name || '') + '. All rights reserved.'),
            el('span', { style: bad ? { color: '#ff9a9a', fontWeight: 500 } : null },
              'AZ License #' + (d.license_number || '') + ' · Equal Housing Opportunity',
              bad ? el('span', { style: { display: 'block', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.14em' } }, '← placeholder — must be fixed before launch') : null))));
    };

    CMS.registerPreviewTemplate('home', HomePreview);
    CMS.registerPreviewTemplate('site', SitePreview);
  }

  boot();
})();
