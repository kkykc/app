/* api.js – KKYKC-app (B0, 18/11/2026; B4 19/11: service worker + melding nieuwe versie; B3c 19/11: navigatiebalk, rollen, voorladen in één aanroep, tijden in de console). Aanmelden met Google (enkel naam/e-mail, geen Drive) + aanroepen naar de API.
   Aanmeldbewijs en rol(len) in sessionStorage (weg bij sluiten van het tabblad of bij afmelden).
   B3i (20/11/2026): wat de pagina toelaat (KKYKC.toestel) ook op het toestel (IndexedDB 'kkykc-toestel', per account, gewist bij Afmelden): meteen tonen,
   op de achtergrond controleren met de versie v (server antwoordt {zelfde} zonder gegevens), tot dan geen wijzigingen. Leesaanroepen: 2× opnieuw bij drukte. */
(function () {
  'use strict';
  var CFG = { clientId: '268969308679-66i1siv7po4t2cr0fni8eghbkf7piu6n.apps.googleusercontent.com', apiUrl: 'https://script.google.com/macros/s/AKfycbwCbEbEokU-xwv29crnbaAPL4foqplCrh7N86nHSSL-GC4uH6W9MxTo1sjv5IQluO2NaQ/exec' };
  var SLEUTEL = 'kkykc_token', ROL = 'kkykc_rollen', token = null, bijAanmelden = [], VOOR = {};
  function exp(t) { try { var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))).exp * 1000; } catch (e) { return 0; } }
  function geldig(t) { return !!t && exp(t) > Date.now() + 60000; }
  try { var s = sessionStorage.getItem(SLEUTEL); if (geldig(s)) token = s; else sessionStorage.removeItem(SLEUTEL); } catch (e) {}

  function zetToken(t) { token = t; geheugenWis(); try { sessionStorage.setItem(SLEUTEL, t); } catch (e) {} planVernieuwen();
    var a = acct(); if (a) tWis(function (k) { return k.indexOf(a + '|') !== 0; });   /* B3i: gegevens van een ander account weg */
    bijAanmelden.forEach(function (f) { f(); }); }
  /* ---------- B3k: aangemeld blijven via Google (geen eigen langlopend aanmeldbewijs op het toestel) ----------
     Het aanmeldbewijs van Google is 1 uur geldig. Wie zich hier al eens aanmeldde, wordt automatisch opnieuw aangemeld (FedCM 'auto select'):
     bij het openen van een pagina en ±5 min voor het bewijs verloopt. Na 'Afmelden' niet meer automatisch tot je zelf weer op de knop drukt.
     Meerdere Google-accounts in de browser: Google toont dan een keuze (één klik). */
  var AUTO = 'kkykc-auto', gisInit = false, autoGedaan = false, vernieuwT = null;
  function autoMag() { try { return localStorage.getItem(AUTO) !== 'uit'; } catch (e) { return true; } }
  function gisKlaar() {
    if (!window.google || !google.accounts || !google.accounts.id) return false;
    if (!gisInit) { gisInit = true;
      google.accounts.id.initialize({ client_id: CFG.clientId, callback: function (r) { try { localStorage.removeItem(AUTO); } catch (e) {} zetToken(r.credential); },
        auto_select: autoMag(), cancel_on_tap_outside: true, use_fedcm_for_prompt: true, ux_mode: 'popup', itp_support: true }); }
    return true;
  }
  function autoAanmelden(opnieuw) {
    if (!autoMag() || (autoGedaan && !opnieuw) || (!opnieuw && geldig(token))) return;
    if (!gisKlaar()) { setTimeout(function () { autoAanmelden(opnieuw); }, 300); return; }
    autoGedaan = true; try { google.accounts.id.prompt(); } catch (e) {}
  }
  function planVernieuwen() {   /* ±5 min voor het bewijs verloopt: stil een nieuw bewijs vragen (lukt het niet, dan vraagt de pagina later om aan te melden) */
    clearTimeout(vernieuwT); if (!token) return;
    var ms = exp(token) - Date.now() - 300000;
    vernieuwT = setTimeout(function () { if (token) autoAanmelden(true); }, Math.max(ms, 30000));
  }
  function uitloggen() {   /* aanmelding weg (verlopen of afmelden); de bewaarde gegevens op het toestel blijven enkel bij verlopen */
    token = null; VOOR = {}; geheugenWis(); try { sessionStorage.removeItem(SLEUTEL); sessionStorage.removeItem(ROL); } catch (e) {}
    var b = document.getElementById('kkykcBalk'), bl = document.getElementById('kkykcBalkL'); if (bl) bl.textContent = ''; if (b) b.removeAttribute('data-links');
  }
  /* ---------- B3i: bewaren op het toestel ---------- */
  var TDB = 'kkykc-toestel', TST = { beleid: null, open: [], wacht: 0, nieuw: false, fout: null, oudste: 0, gezien: {}, schrijf: 0, timer: 0 }, idbP = null;   /* B6b: gezien/schrijf/timer (A4) */
  function acct() { try { var p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return String(JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))).email || '').toLowerCase(); } catch (e) { return ''; } }
  function idb() {
    if (!idbP) idbP = new Promise(function (res) {
      try { var q = indexedDB.open(TDB, 1); q.onupgradeneeded = function () { q.result.createObjectStore('g'); }; q.onsuccess = function () { res(q.result); }; q.onerror = q.onblocked = function () { res(null); }; }
      catch (e) { res(null); } });
    return idbP;
  }
  function tDo(modus, f) { return idb().then(function (db) { if (!db) return null; return new Promise(function (res) {
    try { var tx = db.transaction('g', modus), q = f(tx.objectStore('g')); tx.oncomplete = function () { res(q && q.result !== undefined ? q.result : null); }; tx.onerror = tx.onabort = function () { res(null); }; }
    catch (e) { res(null); } }); }); }
  function tLees(k) { return tDo('readonly', function (s) { return s.get(k); }); }
  function tZet(k, v) { return tDo('readwrite', function (s) { s.put(v, k); }); }
  function tWis(filter) { return tDo('readwrite', function (s) { if (!filter) { s.clear(); return null; }
    var c = s.openCursor(); c.onsuccess = function () { var x = c.result; if (!x) return; if (filter(String(x.key))) x['delete'](); x['continue'](); }; return null; }); }
  function tMag(fn, a) { var b = TST.beleid; return !!(b && geldig(token) && b.fns.indexOf(fn) >= 0 && !(fn === 'getPlanning' && a[1] === true) && (!b.voorwaarde || b.voorwaarde())); }
  function tSleutel(fn, a) { return acct() + '|' + fn + JSON.stringify(a); }
  function tGeldig(x) { return !!(x && x.v && x.d !== undefined && TST.beleid && Date.now() - x.t < TST.beleid.dagen * 864e5); }
  function wanneer(t) { var d = new Date(t), nu = new Date(), u = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    var v = Math.round((new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    return v === 0 ? 'vandaag ' + u : v === 1 ? 'gisteren ' + u : d.getDate() + '/' + (d.getMonth() + 1) + ' ' + u; }
  /* melding bovenaan: bewaarde gegevens → nagaan → up-to-date / nieuwe gegevens (Vernieuwen) / niet gelukt */
  function versheid() {
    if (!document.body) return;
    var el = document.getElementById('kkykcVers');
    if (!el) { el = document.createElement('div'); el.id = 'kkykcVers'; el.setAttribute('role', 'status');
      el.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:6px 12px;font:13px Arial,Helvetica,sans-serif';
      /* B6b (A5): kleuren volgen het thema (licht/donker, ook de systeeminstelling) i.p.v. altijd licht oranje */
      if (!document.getElementById('kkykcVersStijl')) { var st = document.createElement('style'); st.id = 'kkykcVersStijl';
        st.textContent = '#kkykcVers{background:#fff4e5;color:#4a2a00;border-bottom:1px solid #f0c48a}' +
          ':root[data-theme=dark] #kkykcVers{background:#33240f;color:#ffe2bf;border-bottom-color:#6b4a1f}' +
          '@media (prefers-color-scheme: dark){:root:not([data-theme=light]) #kkykcVers{background:#33240f;color:#ffe2bf;border-bottom-color:#6b4a1f}}' +
          '#kkykcVers button{padding:4px 12px;border-radius:14px;border:0;background:#c25507;color:#fff;cursor:pointer;font:inherit}';
        document.head.appendChild(st); }
      var nav = document.getElementById('kkykcBalk'); if (nav && nav.parentNode) nav.parentNode.insertBefore(el, nav.nextSibling); else document.body.insertBefore(el, document.body.firstChild); }
    el.hidden = false; el.textContent = '';
    var tekst = document.createElement('span'), knop = function (t, f) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = f; el.appendChild(b); };
    el.appendChild(tekst);
    if (TST.wacht > 0) { tekst.textContent = 'Bewaarde gegevens van ' + wanneer(TST.oudste) + ' · nagaan of er nieuwe zijn…'; return; }
    if (TST.nieuw) { tekst.textContent = 'Nieuwe gegevens beschikbaar.'; knop('Vernieuwen', function () { location.reload(); }); return; }
    if (TST.fout) { tekst.textContent = 'Kon niet nagaan of er nieuwe gegevens zijn. Getoond: bewaarde gegevens van ' + wanneer(TST.oudste) + '.'; knop('Opnieuw', function () { location.reload(); }); return; }
    tekst.textContent = 'Je gegevens zijn up-to-date.'; setTimeout(function () { if (!TST.wacht && !TST.nieuw && !TST.fout) el.hidden = true; }, 2500);
  }
  /* B6b (A4, 21/11/2026): na een geslaagde wijziging de gegevens die deze pagina op het toestel bewaart meteen opnieuw ophalen en bewaren (op de achtergrond,
     2 s na de laatste wijziging, max. 6 leesaanroepen in één aanroep 'bundel'), zodat de volgende opening weer meteen van het toestel komt. Vroeger bleef het toestel leeg
     tot de volgende opening (= traag). Komt er intussen nog een wijziging, dan wordt het resultaat weggegooid (nooit verouderde gegevens bewaren). */
  function naWijziging() {
    if (!TST.beleid || !Object.keys(TST.gezien).length) return;
    clearTimeout(TST.timer);
    TST.timer = setTimeout(function () {
      var n = TST.schrijf, a = acct(), calls = Object.keys(TST.gezien).map(function (k) { return TST.gezien[k]; })
        .filter(function (c) { return c[0] !== 'getMedia' && tMag(c[0], c[1]); }).slice(-6);   /* de 6 laatst geopende (planner: weken) */
      if (!calls.length || !a || !geldig(token)) return;
      KKYKC.api('bundel', [calls]).then(function (r) {
        if (n !== TST.schrijf || acct() !== a) return;
        (r.data || []).forEach(function (x, i) { if (x && x.ok && x.v && x.data !== undefined) tZet(a + '|' + calls[i][0] + JSON.stringify(calls[i][1]), { t: Date.now(), v: x.v, d: x.data }); });
        try { console.info('[KKYKC] na de wijziging opnieuw bewaard op het toestel: ' + calls.map(function (c) { return c[0]; }).join(', ')); } catch (e) {}
      }, function () {});
    }, 2000);
  }
  /* antwoord uit de bundel (voorladen) of een aparte aanroep; v = versie die we al hebben → {zelfde:true} */
  function haal(fn, a, k, v) {
    var p = VOOR[k];
    if (p && Date.now() - p.t > 60000) p = null;   /* B3d: voorgeladen gegevens max. 1 min gebruiken */
    if (p) { delete VOOR[k];
      return p.p.then(function (x) {
        if (!x) return KKYKC.api(fn, a, v);
        if (!x.ok) throw Object.assign(new Error(x.tekst || 'Fout'), { code: x.code });
        if (x.zelfde && (!v || v !== x.v)) return KKYKC.api(fn, a, v);
        return { data: x.data, v: x.v, zelfde: !!x.zelfde }; }); }
    return KKYKC.api(fn, a, v);
  }
  /* B3f: tabgeheugen – leesantwoorden max. 5 min in sessionStorage van DIT tabblad (weg bij sluiten van het tabblad, afmelden, opnieuw aanmelden
     en na elke wijziging). Zo opent een pagina meteen als je ze net bezocht. Nooit localStorage of IndexedDB (privacy: logboeken van minderjarigen). */
  var GEH = 'kkykc_g|', GEH_MS = 300000;
  var GEH_FN = /^(mijnData|getJaren|getPlanning|getTrainerslog|getControle|getSeizoen|getLogboek|getTesten|getToegang|getOpslag|getBibliotheek|getOpmerkingen|getPlannerData|getJaarData|pilotLijst)$/;   /* B3h: pilotLijst (teller Toegangsbeheer) ook; elke wijziging wist het geheugen */
  function geheugenMag(fn, a) { return GEH_FN.test(fn) && !(fn === 'getPlanning' && a[1] === true); }   /* 'vers' (schema opnieuw inlezen) nooit uit het geheugen */
  function geheugenLees(k) { try { var x = JSON.parse(sessionStorage.getItem(GEH + k) || 'null'); return x && Date.now() - x.t < GEH_MS ? x : null; } catch (e) { return null; } }
  function geheugenZet(k, d) { try { sessionStorage.setItem(GEH + k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) { try { sessionStorage.removeItem(GEH + k); } catch (x) {} } }   /* te groot → gewoon niet onthouden */
  function geheugenWis(fn) { try { Object.keys(sessionStorage).forEach(function (s) { if (s.indexOf(GEH) === 0 && (!fn || s.indexOf(GEH + fn + '[') === 0)) sessionStorage.removeItem(s); }); } catch (e) {} }

  var KKYKC = window.KKYKC = {
    ingesteld: function () { return CFG.clientId.indexOf('__') !== 0 && CFG.apiUrl.indexOf('__') !== 0; },
    aangemeld: function () { return geldig(token); },
    opAanmelden: function (f) { bijAanmelden.push(f); },
    /* Toont de Google-knop in el. De gebruiker kiest zelf het account → geen multi-account-fout.
       B3k: daarnaast automatisch aanmelden (Google, FedCM) voor wie zich hier al eens aanmeldde en niet zelf afmeldde – geen klik nodig. */
    knop: function (el) {
      if (!gisKlaar()) { setTimeout(function () { KKYKC.knop(el); }, 200); return; }
      google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'nl' });
      autoAanmelden();
    },
    afmelden: function () {   /* Afmelden (knop): ook alles wat op dit toestel bewaard is, en niet meer automatisch aanmelden */
      uitloggen(); tWis(); clearTimeout(vernieuwT); try { localStorage.setItem(AUTO, 'uit'); } catch (e) {}
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
    },
    /* B3i: wat deze pagina op het toestel mag bewaren: { fns: [...], dagen: n, voorwaarde: function () → true/false } */
    toestel: function (b) { TST.beleid = b; },
    /* B3i: dashboard enkel op een eigen toestel (keuze per toestel; uitzetten wist de bewaarde dashboardgegevens) */
    eigenToestel: function (aan) {
      if (aan === undefined) { try { return localStorage.getItem('kkykc-eigen-toestel') === 'ja'; } catch (e) { return false; } }
      try { if (aan) localStorage.setItem('kkykc-eigen-toestel', 'ja'); else localStorage.removeItem('kkykc-eigen-toestel'); } catch (e) {}
      if (!aan) tWis(function (k) { return /\|(getJaren|getPlanning|getTrainerslog|getControle|getSeizoen|getLogboek|getTesten|getOpslag)\[/.test(k); });
      return !!aan;
    },
    /* api('wieBenIk') → Promise met data; fout: Error met .code (token, verlopen, aud, test, rol, fn, net …) en .ms */
    api: function (fn, args, v) {
      var t0 = performance.now(), lezen = /^(get|bundel$|wieBenIk$|mijnData$|mijnToegang$|pilotLijst$)/.test(fn);
      if (!lezen) {
        VOOR = {}; geheugenWis();   /* B3d: na een wijziging geen voorgeladen (mogelijk verouderde) gegevens meer */
        /* B3i: eerst moeten de getoonde bewaarde gegevens bevestigd zijn – nooit wijzigen op basis van verouderde gegevens */
        if (TST.open.length) { var open = TST.open; TST.open = [];
          return Promise.all(open.map(function (c) { return c.then(function () { return 0; }, function () { return 1; }); })).then(function (f) {
            if (TST.nieuw) throw Object.assign(new Error('Er zijn nieuwe gegevens. Klik eerst bovenaan op Vernieuwen voor je iets wijzigt.'), { code: 'oud' });
            if (f.some(Boolean)) throw Object.assign(new Error('Kon niet nagaan of je gegevens nog kloppen. Herlaad de pagina voor je iets wijzigt.'), { code: 'oud' });
            return KKYKC.api(fn, args, v); }); }
        var a0 = acct(); if (TST.beleid && a0) { var fns = TST.beleid.fns; tWis(function (k) { return k.indexOf(a0 + '|') === 0 && fns.some(function (f) { return f !== 'getMedia' && k.indexOf('|' + f + '[') > 0; }); }); }   /* na een wijziging: volgende keer vers (B6b: afbeeldingen per id wijzigen nooit → blijven) */
        TST.schrijf++;
      }
      if (!geldig(token)) { var e0 = new Error('Je aanmelding is verlopen. Meld je opnieuw aan.'); e0.code = 'verlopen'; uitloggen(); return Promise.reject(e0); }
      var body = { fn: fn, args: args || [], token: token }; if (v) body.v = v;
      var poging = function (n) {
        /* text/plain = "eenvoudige" aanvraag → geen CORS-voorcontrole, die Apps Script niet beantwoordt */
        return fetch(CFG.apiUrl, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })
          .then(function (r) { if (!r.ok) throw Object.assign(new Error('De server antwoordt niet (' + r.status + ').'), { code: 'net', status: r.status }); return r.json(); },
                function () { throw Object.assign(new Error('Geen verbinding met de server.'), { code: 'net' }); })
          .then(null, function (e) {   /* B3i: drukte bij Google (te veel tegelijk) of een haperende verbinding → leesaanroep 2× opnieuw na 1,5 en 3 s */
            if (!lezen || n >= 2 || (e && e.code && e.code !== 'net') && !(e instanceof SyntaxError)) throw (e instanceof SyntaxError ? Object.assign(new Error('Onverwacht antwoord van de server.'), { code: 'net' }) : e);
            try { console.info('[KKYKC] ' + fn + ' opnieuw (' + (n + 1) + ')'); } catch (x) {}
            return new Promise(function (res) { setTimeout(res, 1500 * (n + 1)); }).then(function () { return poging(n + 1); });
          });
      };
      return poging(0).then(function (r) {
          var ms = Math.round(performance.now() - t0);
          if (!r.ok) { if (r.code === 'token' || r.code === 'verlopen' || r.code === 'aud') uitloggen();
            if (r.code === 'rol' || r.code === 'test') { var a1 = acct(); if (a1) tWis(function (k) { return k.indexOf(a1 + '|') === 0; }); }   /* B3i: geen toegang meer → bewaarde gegevens weg */
            throw Object.assign(new Error(r.tekst || 'Fout'), { code: r.code, ms: ms }); }
          try { console.info('[KKYKC] ' + fn + ' ' + ms + ' ms (server ' + r.ms + ' ms)' + (r.zelfde ? ' ongewijzigd' : '')); } catch (e) {}   /* enkel naam + tijd, geen gegevens */
          if (!lezen) naWijziging();   /* B6b (A4) */
          return { data: r.data, ms: ms, serverMs: r.ms, v: r.v, zelfde: !!r.zelfde };
        });
    },
    /* Voor de gebouwde pagina's (B1+): zelfde vorm als gs() in de huidige webapps */
    gs: function (fn) {
      var a = Array.prototype.slice.call(arguments, 1), k = fn + JSON.stringify(a), mag = geheugenMag(fn, a);
      if (mag) { var g = geheugenLees(k); if (g) { delete VOOR[k]; try { console.info('[KKYKC] ' + fn + ' uit het tabgeheugen'); } catch (e) {} return Promise.resolve(g.d); } }
      var bewaar = function (d) { if (mag) geheugenZet(k, d); return d; };
      if (tMag(fn, a)) {   /* B3i: bewaard op het toestel → meteen tonen + op de achtergrond controleren */
        var sl = tSleutel(fn, a); TST.gezien[fn + JSON.stringify(a)] = [fn, a];   /* B6b (A4): na een wijziging opnieuw ophalen */
        return tLees(sl).then(function (x) {
          if (tGeldig(x)) {
            TST.wacht++; if (!TST.oudste || x.t < TST.oudste) TST.oudste = x.t;
            var c = haal(fn, a, k, x.v).then(function (r) {
              if (r.zelfde) { tZet(sl, { t: Date.now(), v: x.v, d: x.d }); bewaar(x.d); }
              else { tZet(sl, { t: Date.now(), v: r.v, d: r.data }); bewaar(r.data); TST.nieuw = true; }
            }, function (e) { TST.fout = e; if (e && (e.code === 'test' || e.code === 'rol')) { if (!window.kkykcNaarAanvraag) { window.kkykcNaarAanvraag = true; location.replace('index.html?blijf=1'); } } throw e; });
            TST.open.push(c);
            c.then(function () { TST.wacht--; versheid(); }, function () { TST.wacht--; versheid(); });
            versheid();
            try { console.info('[KKYKC] ' + fn + ' van het toestel (' + wanneer(x.t) + ')'); } catch (e) {}
            return x.d;
          }
          return haal(fn, a, k, null).then(function (r) { if (r.v) tZet(sl, { t: Date.now(), v: r.v, d: r.data }); return bewaar(r.data); });
        });
      }
      return haal(fn, a, k, null).then(function (r) { return bewaar(r.data); });
    },
    /* B3c: leesaanroepen vooraf bundelen tot één API-aanroep ('bundel'). De pagina roept daarna gewoon gs() op; die krijgt het antwoord uit de bundel.
       Mislukt de bundel (bv. oudere server), dan gaat elke aanroep apart zoals vroeger. calls = [[fn, args], …] – args exact zoals de pagina ze doorgeeft. */
    voorladen: function (calls) {
      if (!geldig(token)) return;
      calls = calls.filter(function (c) { return !(geheugenMag(c[0], c[1]) && geheugenLees(c[0] + JSON.stringify(c[1]))); });   /* B3f: wat al in het tabgeheugen zit niet opnieuw */
      if (!calls.length) return;
      /* B3i: versies van wat al op het toestel staat meesturen → de server antwoordt per deelaanroep {zelfde} zonder gegevens */
      var vs = Promise.all(calls.map(function (c) { return tMag(c[0], c[1]) ? tLees(tSleutel(c[0], c[1])).then(function (x) { return tGeldig(x) ? x.v : ''; }) : Promise.resolve(''); }));
      var p = vs.then(function (l) { return KKYKC.api('bundel', l.some(Boolean) ? [calls, l] : [calls]); }).then(function (r) { return r.data; }, function () { return null; });
      var t = Date.now(); calls.forEach(function (c, i) { VOOR[c[0] + JSON.stringify(c[1])] = { t: t, p: p.then(function (d) { return d && d[i] ? d[i] : null; }) }; });
    },
    /* B3c: rollen van dit account (1× per tabblad opgevraagd, daarna uit sessionStorage) */
    rollen: function () {
      try { var c = JSON.parse(sessionStorage.getItem(ROL) || 'null'); if (c && token && c.t === token.slice(-24)) return Promise.resolve(c.r); } catch (e) {}
      return KKYKC.api('wieBenIk').then(function (r) { KKYKC.zetRollen(r.data.rollen); return r.data.rollen; });
    },
    /* B3f: 'Vernieuwen'-knoppen: deze functie(s) de volgende keer van de server, niet uit het tabgeheugen */
    vergeet: function () { var a = acct(); Array.prototype.slice.call(arguments).forEach(function (f) { geheugenWis(f); Object.keys(VOOR).forEach(function (k) { if (k.indexOf(f + '[') === 0) delete VOOR[k]; });
      if (a) tWis(function (k) { return k.indexOf(a + '|' + f + '[') === 0; }); }); },
    zetRollen: function (r) { try { if (token) sessionStorage.setItem(ROL, JSON.stringify({ t: token.slice(-24), r: r })); } catch (e) {} },
    /* B3c: startpagina per rol – Mijn trainingen (Koppeling) → anders hoofdtrainer: dashboard → trainer: trainersportaal */
    startpagina: function (r) { return r.indexOf('sporter') >= 0 ? 'mijn.html' : r.indexOf('hoofdtrainer') >= 0 ? 'dashboard.html' : r.indexOf('trainer') >= 0 ? 'trainers.html' : ''; },
    /* B3c/B3e: navigatiebalk bovenaan elke pagina. Altijd: de knop licht/donker (één instelling voor alle pagina's). Aangemeld met een rol: ook de
       pagina's die je rollen toelaten + Account (afmelden). opties.zonderLinks: enkel de themaknop (startpagina vóór wieBenIk). */
    balk: function (opties) {
      if (!document.body) return;
      var n = document.getElementById('kkykcBalk');
      if (!n) {
        n = document.createElement('nav'); n.id = 'kkykcBalk'; n.setAttribute('aria-label', 'KKYKC-app');
        n.style.cssText = 'display:flex;gap:6px;align-items:center;padding:6px 10px;background:#1f2328;font:13px Arial,Helvetica,sans-serif;position:relative;z-index:50;min-height:30px';
        var L = document.createElement('span'); L.id = 'kkykcBalkL'; L.style.cssText = 'display:flex;gap:6px;align-items:center;flex:1;min-width:0;overflow-x:auto;scrollbar-width:thin';   /* B3h: enkel de links scrollen, de themaknop staat vast rechts */
        var k = document.createElement('button'); k.type = 'button'; k.id = 'kkykcThema';
        k.style.cssText = 'margin-left:auto;flex:none;width:32px;height:30px;border-radius:15px;border:1px solid #444c56;background:#30363d;color:#fff;font-size:16px;line-height:1;cursor:pointer';
        k.onclick = function () { zetThema(huidigThema() === 'dark' ? 'light' : 'dark'); };
        n.appendChild(L); n.appendChild(k);
        document.body.insertBefore(n, document.body.firstChild);
        themaKnopBalk();
      }
      if ((opties && opties.zonderLinks) || !geldig(token) || n.getAttribute('data-links')) return;
      n.setAttribute('data-links', 'bezig');
      KKYKC.rollen().then(function (r) {
        var heeft = function (l) { return r.some(function (x) { return l.indexOf(x) >= 0; }); };
        var P = [['mijn.html', 'Mijn trainingen', ['sporter']], ['trainers.html', 'Trainersportaal', ['trainer', 'hoofdtrainer']], ['dashboard.html', 'Dashboard', ['hoofdtrainer']],
          ['planner.html', 'Planner', ['hoofdtrainer']]].filter(function (x) { return heeft(x[2]); });
        var L = document.getElementById('kkykcBalkL'); if (!L) return;
        L.textContent = ''; n.setAttribute('data-links', '1');
        if (!P.length) return;   /* geen rol → enkel de themaknop */
        var hier = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        P.forEach(function (x) {
          var a = document.createElement('a'); a.href = x[0]; a.textContent = x[1];
          var actief = hier === x[0]; if (actief) a.setAttribute('aria-current', 'page');
          a.style.cssText = 'white-space:nowrap;text-decoration:none;padding:5px 12px;border-radius:14px;color:#fff;' + (actief ? 'background:#c96008;font-weight:bold' : 'background:#30363d');
          L.appendChild(a);
        });
        var s = document.createElement('a'); s.href = 'index.html?blijf=1'; s.textContent = 'Account';
        var opAccount = /^(index\.html)?$/.test(hier); if (opAccount) s.setAttribute('aria-current', 'page');
        s.style.cssText = 'margin-left:auto;white-space:nowrap;text-decoration:none;padding:5px 10px;border-radius:14px;' + (opAccount ? 'background:#c96008;color:#fff;font-weight:bold' : 'color:#c9d1d9');
        L.appendChild(s);
      }, function () { n.removeAttribute('data-links'); });
    }
  };
  /* B3e: één thema voor alle pagina's. Bron = localStorage 'kkykc-thema'; de pagina's lezen bij het laden elk hun eigen sleutel
     (dashboard/portaal: kkykc-thema · planner: kkykc-pl-thema · Mijn trainingen: kkykc-mt-thema) → api.js houdt ze gelijk. */
  var THEMA_SL = ['kkykc-thema', 'kkykc-pl-thema', 'kkykc-mt-thema'];
  function huidigThema() { var t = document.documentElement.getAttribute('data-theme'); if (t === 'dark' || t === 'light') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  function themaKnopBalk() { var k = document.getElementById('kkykcThema'); if (!k) return; var d = huidigThema() === 'dark';
    k.textContent = d ? '☀' : '☾'; k.title = d ? 'Lichte modus' : 'Donkere modus'; k.setAttribute('aria-label', k.title); k.setAttribute('aria-pressed', d ? 'true' : 'false'); }
  function zetThema(v) {
    document.documentElement.setAttribute('data-theme', v);
    try { THEMA_SL.forEach(function (k) { localStorage.setItem(k, v); }); } catch (e) {}
    themaKnopBalk(); try { if (typeof window.themaKnop === 'function') window.themaKnop(); } catch (e) {}
  }
  (function () {   /* bij het laden: gekozen thema meteen toepassen en de sleutels van de pagina's gelijkzetten (vóór hun eigen code) */
    try { var v = localStorage.getItem('kkykc-thema'); if (v === 'dark' || v === 'light') { document.documentElement.setAttribute('data-theme', v); THEMA_SL.forEach(function (k) { localStorage.setItem(k, v); }); } } catch (e) {}
  })();
  if (token) planVernieuwen();   /* B3k */
  /* balk zodra de pagina geladen is en na elke aanmelding; op de startpagina eerst enkel de themaknop (de pagina vult de rest na wieBenIk) */
  var opIndex = /^(index\.html)?$/i.test(location.pathname.split('/').pop() || '');
  var auto = function () { KKYKC.balk(opIndex ? { zonderLinks: true } : null); };
  bijAanmelden.push(auto);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();

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
