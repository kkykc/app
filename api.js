/* api.js – KKYKC-app (B0, 18/11/2026; B4 19/11: service worker + melding nieuwe versie). Aanmelden met Google (enkel naam/e-mail, geen Drive) + aanroepen naar de API.
   Geen gegevens op het toestel behalve het aanmeldbewijs in sessionStorage (weg bij sluiten van het tabblad of bij afmelden). */
(function () {
  'use strict';
  var CFG = { clientId: '268969308679-66i1siv7po4t2cr0fni8eghbkf7piu6n.apps.googleusercontent.com', apiUrl: 'https://script.google.com/macros/s/AKfycbwCbEbEokU-xwv29crnbaAPL4foqplCrh7N86nHSSL-GC4uH6W9MxTo1sjv5IQluO2NaQ/exec' };
  var SLEUTEL = 'kkykc_token', token = null, bijAanmelden = [];
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
      token = null; try { sessionStorage.removeItem(SLEUTEL); } catch (e) {}
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
    },
    /* api('wieBenIk') → Promise met data; fout: Error met .code (token, verlopen, aud, test, rol, fn, net …) en .ms */
    api: function (fn, args) {
      var t0 = performance.now();
      if (!geldig(token)) { var e0 = new Error('Je aanmelding is verlopen. Meld je opnieuw aan.'); e0.code = 'verlopen'; KKYKC.afmelden(); return Promise.reject(e0); }
      /* text/plain = "eenvoudige" aanvraag → geen CORS-voorcontrole, die Apps Script niet beantwoordt */
      return fetch(CFG.apiUrl, { method: 'POST', body: JSON.stringify({ fn: fn, args: args || [], token: token }), redirect: 'follow' })
        .then(function (r) { if (!r.ok) throw Object.assign(new Error('De server antwoordt niet (' + r.status + ').'), { code: 'net' }); return r.json(); },
              function () { throw Object.assign(new Error('Geen verbinding met de server.'), { code: 'net' }); })
        .then(function (r) {
          var ms = Math.round(performance.now() - t0);
          if (!r.ok) { if (r.code === 'token' || r.code === 'verlopen' || r.code === 'aud') KKYKC.afmelden();
            throw Object.assign(new Error(r.tekst || 'Fout'), { code: r.code, ms: ms }); }
          return { data: r.data, ms: ms, serverMs: r.ms };
        });
    },
    /* Voor de gebouwde pagina's (B1+): zelfde vorm als gs() in de huidige webapps */
    gs: function (fn) { var a = Array.prototype.slice.call(arguments, 1); return KKYKC.api(fn, a).then(function (r) { return r.data; }); }
  };

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
