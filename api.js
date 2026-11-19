/* api.js – KKYKC-app (B0, 18/11/2026; B4 19/11: service worker + melding nieuwe versie; B3c 19/11: navigatiebalk, rollen, voorladen in één aanroep, tijden in de console). Aanmelden met Google (enkel naam/e-mail, geen Drive) + aanroepen naar de API.
   Geen gegevens op het toestel behalve het aanmeldbewijs en je rol(len) in sessionStorage (weg bij sluiten van het tabblad of bij afmelden). */
(function () {
  'use strict';
  var CFG = { clientId: '268969308679-66i1siv7po4t2cr0fni8eghbkf7piu6n.apps.googleusercontent.com', apiUrl: 'https://script.google.com/macros/s/AKfycbwCbEbEokU-xwv29crnbaAPL4foqplCrh7N86nHSSL-GC4uH6W9MxTo1sjv5IQluO2NaQ/exec' };
  var SLEUTEL = 'kkykc_token', ROL = 'kkykc_rollen', token = null, bijAanmelden = [], VOOR = {};
  function exp(t) { try { var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))).exp * 1000; } catch (e) { return 0; } }
  function geldig(t) { return !!t && exp(t) > Date.now() + 60000; }
  try { var s = sessionStorage.getItem(SLEUTEL); if (geldig(s)) token = s; else sessionStorage.removeItem(SLEUTEL); } catch (e) {}

  function zetToken(t) { token = t; try { sessionStorage.setItem(SLEUTEL, t); } catch (e) {} bijAanmelden.forEach(function (f) { f(); }); }

  var KKYKC = window.KKYKC = {
    ingesteld: function () { return CFG.clientId.indexOf('__') !== 0 && CFG.apiUrl.indexOf('__') !== 0; },
    aangemeld: function () { return geldig(token); },
    opAanmelden: function (f) { bijAanmelden.push(f); },
    /* Toont de Google-knop in el. De gebruiker kiest zelf het account → geen multi-account-fout. */
    knop: function (el) {
      if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(function () { KKYKC.knop(el); }, 200); return; }
      google.accounts.id.initialize({ client_id: CFG.clientId, callback: function (r) { zetToken(r.credential); },
        auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true, ux_mode: 'popup' });
      google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'nl' });
    },
    afmelden: function () {
      token = null; VOOR = {}; try { sessionStorage.removeItem(SLEUTEL); sessionStorage.removeItem(ROL); } catch (e) {}
      var b = document.getElementById('kkykcBalk'); if (b) b.remove();
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
    },
    /* api('wieBenIk') → Promise met data; fout: Error met .code (token, verlopen, aud, test, rol, fn, net …) en .ms */
    api: function (fn, args) {
      var t0 = performance.now();
      if (!/^(get|bundel$|wieBenIk$|mijnData$|mijnToegang$)/.test(fn)) VOOR = {};   /* B3d: na een wijziging geen voorgeladen (mogelijk verouderde) gegevens meer */
      if (!geldig(token)) { var e0 = new Error('Je aanmelding is verlopen. Meld je opnieuw aan.'); e0.code = 'verlopen'; KKYKC.afmelden(); return Promise.reject(e0); }
      /* text/plain = "eenvoudige" aanvraag → geen CORS-voorcontrole, die Apps Script niet beantwoordt */
      return fetch(CFG.apiUrl, { method: 'POST', body: JSON.stringify({ fn: fn, args: args || [], token: token }), redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw Object.assign(new Error('De server antwoordt niet (' + r.status + ').'), { code: 'net' }); return r.json(); },
              function () { throw Object.assign(new Error('Geen verbinding met de server.'), { code: 'net' }); })
        .then(function (r) {
          var ms = Math.round(performance.now() - t0);
          if (!r.ok) { if (r.code === 'token' || r.code === 'verlopen' || r.code === 'aud') KKYKC.afmelden();
            throw Object.assign(new Error(r.tekst || 'Fout'), { code: r.code, ms: ms }); }
          try { console.info('[KKYKC] ' + fn + ' ' + ms + ' ms (server ' + r.ms + ' ms)'); } catch (e) {}   /* enkel naam + tijd, geen gegevens */
          return { data: r.data, ms: ms, serverMs: r.ms };
        });
    },
    /* Voor de gebouwde pagina's (B1+): zelfde vorm als gs() in de huidige webapps */
    gs: function (fn) {
      var a = Array.prototype.slice.call(arguments, 1), k = fn + JSON.stringify(a), v = VOOR[k];
      if (v && Date.now() - v.t > 60000) v = null;   /* B3d: voorgeladen gegevens max. 1 min gebruiken */
      if (v) { delete VOOR[k]; v = v.p;   /* B3c: al opgehaald in de gebundelde aanroep */
        return v.then(function (x) { if (!x) return KKYKC.api(fn, a).then(function (r) { return r.data; });
          if (x.ok) return x.data; throw Object.assign(new Error(x.tekst || 'Fout'), { code: x.code }); }); }
      return KKYKC.api(fn, a).then(function (r) { return r.data; });
    },
    /* B3c: leesaanroepen vooraf bundelen tot één API-aanroep ('bundel'). De pagina roept daarna gewoon gs() op; die krijgt het antwoord uit de bundel.
       Mislukt de bundel (bv. oudere server), dan gaat elke aanroep apart zoals vroeger. calls = [[fn, args], …] – args exact zoals de pagina ze doorgeeft. */
    voorladen: function (calls) {
      if (!geldig(token)) return;
      var p = KKYKC.api('bundel', [calls]).then(function (r) { return r.data; }, function () { return null; });
      var t = Date.now(); calls.forEach(function (c, i) { VOOR[c[0] + JSON.stringify(c[1])] = { t: t, p: p.then(function (d) { return d && d[i] ? d[i] : null; }) }; });
    },
    /* B3c: rollen van dit account (1× per tabblad opgevraagd, daarna uit sessionStorage) */
    rollen: function () {
      try { var c = JSON.parse(sessionStorage.getItem(ROL) || 'null'); if (c && token && c.t === token.slice(-24)) return Promise.resolve(c.r); } catch (e) {}
      return KKYKC.api('wieBenIk').then(function (r) { KKYKC.zetRollen(r.data.rollen); return r.data.rollen; });
    },
    zetRollen: function (r) { try { if (token) sessionStorage.setItem(ROL, JSON.stringify({ t: token.slice(-24), r: r })); } catch (e) {} },
    /* B3c: startpagina per rol – Mijn trainingen (Koppeling) → anders hoofdtrainer: dashboard → trainer: trainersportaal */
    startpagina: function (r) { return r.indexOf('sporter') >= 0 ? 'mijn.html' : r.indexOf('hoofdtrainer') >= 0 ? 'dashboard.html' : r.indexOf('trainer') >= 0 ? 'trainers.html' : ''; },
    /* B3c: navigatiebalk bovenaan elke pagina, enkel met de pagina's die jouw rollen toelaten (vanaf 2 pagina's) */
    balk: function () {
      if (!geldig(token) || document.getElementById('kkykcBalk')) return;
      KKYKC.rollen().then(function (r) {
        if (document.getElementById('kkykcBalk') || !document.body) return;
        var heeft = function (l) { return r.some(function (x) { return l.indexOf(x) >= 0; }); };
        var L = [['mijn.html', 'Mijn trainingen', ['sporter']], ['trainers.html', 'Trainersportaal', ['trainer', 'hoofdtrainer']], ['dashboard.html', 'Dashboard', ['hoofdtrainer']],
          ['planner.html', 'Planner', ['hoofdtrainer']]].filter(function (x) { return heeft(x[2]); });
        if (!L.length) return;   /* B3d: ook bij 1 pagina (Account = afmelden); geen rol → geen balk */
        var hier = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        var n = document.createElement('nav'); n.id = 'kkykcBalk'; n.setAttribute('aria-label', 'KKYKC-app');
        n.style.cssText = 'display:flex;gap:6px;align-items:center;overflow-x:auto;padding:6px 10px;background:#1f2328;font:13px Arial,Helvetica,sans-serif;position:relative;z-index:50';
        L.forEach(function (x) {
          var a = document.createElement('a'); a.href = x[0]; a.textContent = x[1];
          var actief = hier === x[0]; if (actief) a.setAttribute('aria-current', 'page');
          a.style.cssText = 'white-space:nowrap;text-decoration:none;padding:5px 12px;border-radius:14px;color:#fff;' + (actief ? 'background:#c96008;font-weight:bold' : 'background:#30363d');
          n.appendChild(a);
        });
        var s = document.createElement('a'); s.href = 'index.html?blijf=1'; s.textContent = 'Account';
        var opAccount = /^(index\.html)?$/.test(hier); if (opAccount) s.setAttribute('aria-current', 'page');
        s.style.cssText = 'margin-left:auto;white-space:nowrap;text-decoration:none;padding:5px 10px;border-radius:14px;' + (opAccount ? 'background:#c96008;color:#fff;font-weight:bold' : 'color:#c9d1d9'); n.appendChild(s);
        document.body.insertBefore(n, document.body.firstChild);
      }, function () {});
    }
  };
  /* B3c: balk zodra de pagina geladen is (als al aangemeld) en na elke aanmelding */
  var opIndex = /^(index\.html)?$/i.test(location.pathname.split('/').pop() || '');   /* de startpagina doet het zelf (na wieBenIk) */
  if (!opIndex) {
    bijAanmelden.push(function () { KKYKC.balk(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { KKYKC.balk(); }); else KKYKC.balk();
  }

  /* B4: service worker (sw.js) bewaart enkel de app-bestanden, nooit gegevens. Nieuwe versie online → melding met knop Vernieuwen.
     Herladen enkel in het tabblad waar op Vernieuwen geklikt werd (geen verlies van werk in een ander tabblad, bv. de planner). */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    var gevraagd = false;
    var meld = function (w) {
      if (!w || !navigator.serviceWorker.controller || document.getElementById('kkykcNieuw')) return;
      var d = document.createElement('div'); d.id = 'kkykcNieuw'; d.setAttribute('role', 'status');
      d.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10000;background:#1f2328;color:#fff;padding:10px 14px;border-radius:10px;font:14px Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:92vw';
      d.textContent = 'Nieuwe versie van de app beschikbaar. ';
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Vernieuwen';
      b.style.cssText = 'margin-left:8px;padding:6px 12px;border-radius:14px;border:0;background:#e8630a;color:#fff;cursor:pointer';
      b.onclick = function () { gevraagd = true; b.disabled = true; w.postMessage('nu'); };
      d.appendChild(b); (document.body || document.documentElement).appendChild(d);
    };
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (gevraagd) location.reload(); });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        if (reg.waiting) meld(reg.waiting);
        reg.addEventListener('updatefound', function () { var w = reg.installing; if (w) w.addEventListener('statechange', function () { if (w.state === 'installed') meld(w); }); });
      }).catch(function () {});
    });
  }
})();
