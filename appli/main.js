/*
 * Écran Il Villaggio — deux modes, changés avec les flèches HAUT / BAS :
 *  - « match »   : l'image de la box SFR en fenêtre, la carte qui défile en bas, le bandeau à droite ;
 *  - « vitrine » : plein écran sans la TV — pizzas en grand, carte complète, desserts, affiches, QR code.
 * La carte (noms, prix, ruptures) est lue en direct dans l'appli de commande.
 * Écrit en JavaScript ancien (TV de 2017). Sur un PC, la page s'affiche en « aperçu ».
 */
window.ILV_PARTI = true;  // pour le lanceur (index.html) : le code a commencé
(function () {
  var BASE = 'https://appli-pizzeria-default-rtdb.europe-west1.firebasedatabase.app/';
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var PHOTOS = ['burger', 'carnivore', '5fromages', 'curry', 'kebab', 'mielleuse', 'regina', 'stracciatella',
                'taleggio', 'marga', 'calzone', 'thon', 'lantanaise', 'tiramisu_maison',
                'nutella', // nutella = la pizza Nutella Banane, photo du pot (comme sur le site de commande)
                'raclette'];
  // La caisse fast food CODART d'Il Villaggio : sa carte publique (lecture seule, clé publique du site).
  var CODART = 'https://zraxwnkolrqcmcvqwgzo.supabase.co/rest/v1/rpc/mod_resto_get_carte_public';
  var CODART_CLE = window.CODART_CLE || '';  // dans cle.js (rangé dans l'appli, jamais mis en ligne)
  var CATEGORIES = { base_tomate: 'Base tomate', base_creme: 'Base crème', pizza_dessert: 'Pizza dessert', desserts: 'Dessert' };
  var ZONE_VIDEO = ['0px', '0px', '1440px', '810px'];
  var SUR_TV = typeof tizen !== 'undefined' && !!tizen.tvwindow;
  var R = REGLAGES;
  // Aperçu sur PC : ?en-ligne=<adresse> pour essayer les réglages à distance.
  (function () {
    var m = !SUR_TV && /[?&]en-ligne=([^&]+)/.exec(location.search);
    if (m) R.adresseEnLigne = decodeURIComponent(m[1]);
  })();
  var EN_LIGNE = R.adresseEnLigne ? R.adresseEnLigne.replace(/\/?$/, '/') : '';
  var recuEnLigne = false;  // vrai dès que des réglages ont été reçus d'internet (alors les images viennent aussi de là)

  // Les derniers réglages reçus d'internet, gardés pour un démarrage sans réseau.
  function appliquerReglages(r) {
    for (var cle in r) if (r.hasOwnProperty(cle) && cle !== 'adresseEnLigne') R[cle] = r[cle];
  }
  if (EN_LIGNE) {
    try {
      var memoReglages = JSON.parse(localStorage.getItem('ilv_reglages') || 'null');
      if (memoReglages) { appliquerReglages(memoReglages); recuEnLigne = true; }
    } catch (e) {}
  }

  var carte = [];       // tout ce qu'on peut montrer (y compris les plats en rupture)
  var plats = [];       // les pizzas disponibles ce soir, dans l'ordre de la carte
  var menuBrut = null;
  var page = 0;
  var mode = R.modeAuDemarrage === 'vitrine' ? 'vitrine' : 'match';
  if (!SUR_TV && /vitrine/.test(location.search)) mode = 'vitrine';

  function $(id) { return document.getElementById(id); }
  function deux(n) { return n < 10 ? '0' + n : '' + n; }
  function echapper(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
  function journal(texte) { var j = $('journal'); j.style.display = 'block'; j.textContent = texte; }
  function attr(t) { return echapper(t).replace(/"/g, '&quot;'); }

  // Une image des desserts ou des affiches : prise sur internet si les réglages en viennent,
  // sinon (ou si elle n'y est pas) celle rangée dans l'appli.
  function image(chemin) {
    var local = attr(chemin);
    if (!recuEnLigne) return '<img src="' + local + '" alt="">';
    return '<img src="' + attr(EN_LIGNE + chemin) + '" alt="" onerror="this.onerror=null;this.src=\'' + local + '\'">';
  }

  /* ---------- Mise à l'échelle (aperçu sur PC uniquement) ---------- */
  function ajuster() {
    if (SUR_TV) return;
    var e = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    var s = $('scene').style;
    s.transform = s.webkitTransform = 'scale(' + e + ')';
    s.left = Math.round((window.innerWidth - 1920 * e) / 2) + 'px';
    s.top = Math.round((window.innerHeight - 1080 * e) / 2) + 'px';
  }

  /* ---------- Heure ---------- */
  function horloge() {
    var d = new Date();
    var h = deux(d.getHours()) + ':' + deux(d.getMinutes());
    var j = JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()];
    $('heure').textContent = h; $('date').textContent = j;
    $('v-heure').textContent = h; $('v-date').textContent = j;
  }

  /* ---------- Outils pour la carte ---------- */
  function prix(p) {
    var n = typeof p === 'number' ? p : parseFloat(String(p).replace(',', '.'));
    if (isNaN(n) || n <= 0) return '';
    return n.toFixed(2).replace('.', ',') + ' €';
  }

  function ingredients(item) {
    var l = item.baseIngredients || [], noms = [], i;
    for (i = 0; i < l.length; i++) noms.push(typeof l[i] === 'string' ? l[i] : (l[i] && l[i].name) || '');
    return noms.join(' · ').replace(/\*/g, '');
  }

  function photo(code, nom) {
    var enLigne = recuEnLigne ? 'url(' + attr(EN_LIGNE) + 'img/pizzas/' + code + '.jpg), ' : '';
    if (PHOTOS.indexOf(code) >= 0) return '<div class="photo" style="background-image:' + enLigne + 'url(img/pizzas/' + code + '.jpg)"></div>';
    // Une nouvelle pizza de la caisse CODART : sa photo est prise en ligne.
    var item = menuBrut && menuBrut[code];
    if (item && item.image) return '<div class="photo" style="background-image:url(' + attr(item.image).replace(/[()]/g, '') + ')"></div>';
    return '<div class="photo sans">' + echapper((nom || '?').charAt(0)) + '</div>';
  }

  /* ---------- Lecture de la carte dans l'appli de commande ---------- */
  function lire(chemin, ok, ko, adresse) {
    var x = new XMLHttpRequest();
    x.open('GET', adresse || (BASE + chemin + '.json'), true);
    x.timeout = 15000;
    x.onload = function () {
      if (x.status !== 200) return ko('réponse ' + x.status);
      try { ok(JSON.parse(x.responseText)); } catch (e) { ko('lecture impossible'); }
    };
    x.onerror = function () { ko('pas de réseau'); };
    x.ontimeout = function () { ko('trop lent'); };
    x.send();
  }

  // Un code simple tiré du nom : « 5 Fromages » -> 5fromages, « Pizza Nutella banane » -> nutella.
  function codeDuNom(nom) {
    var t = String(nom || '').toLowerCase(), de = 'àâäéèêëîïôöùûüç', vers = 'aaaeeeeiioouuuc', r = '', i, c, k;
    for (i = 0; i < t.length; i++) { c = t.charAt(i); k = de.indexOf(c); if (k >= 0) c = vers.charAt(k); if (/[a-z0-9]/.test(c)) r += c; }
    if (/nutella/.test(r) && /^pizza/.test(r)) return 'nutella';
    return r;
  }

  // La carte de la caisse CODART, mise dans la même forme que celle de l'appli de commande.
  function lireCodart(ok, ko) {
    var x = new XMLHttpRequest();
    x.open('POST', CODART, true);
    x.timeout = 15000;
    x.setRequestHeader('Content-Type', 'application/json');
    x.setRequestHeader('apikey', CODART_CLE);
    x.setRequestHeader('Authorization', 'Bearer ' + CODART_CLE);
    x.onload = function () {
      if (x.status !== 200) return ko('caisse : réponse ' + x.status);
      var liste;
      try { liste = JSON.parse(x.responseText); } catch (e) { return ko('caisse : lecture impossible'); }
      if (!liste || !liste.length) return ko('caisse : carte vide');
      var menu = {}, dispo = {}, i, p, cat, code;
      for (i = 0; i < liste.length; i++) {
        p = liste[i]; cat = String(p.categorie_nom || '');
        if (/dessert/i.test(cat)) cat = /^pizza/i.test(p.nom) ? 'pizza_dessert' : '';
        else if (/pizza/i.test(cat)) cat = p.base_type === 'tomate' || /tomate/i.test(cat) ? 'base_tomate' : 'base_creme';
        else cat = '';
        if (!cat) continue; // boissons, desserts en pot (ceux-là sont dans les réglages)
        code = codeDuNom(p.nom);
        menu[code] = { name: p.nom, price: (p.prix_ttc_cents || 0) / 100, category: cat, active: true,
          order: (p.categorie_position || 0) * 1000 + (p.produit_position || 0), baseIngredients: p.ingredients || [],
          image: p.image_url || '', enAvant: !!p.mis_en_avant };
        dispo[code] = p.disponible !== false && !p.epuise;
      }
      ok(menu, dispo);
    };
    x.onerror = function () { ko('caisse : pas de réseau'); };
    x.ontimeout = function () { ko('caisse : trop lent'); };
    x.send(JSON.stringify({ p_slug: R.carteCodart }));
  }

  function chargerCarte() {
    if (R.carteCodart) {
      return lireCodart(function (menu, dispo) { construire(menu, dispo, {}, true); }, function () {
        // La caisse ne répond pas : la dernière carte connue, sinon l'appli de commande.
        try {
          var memo = JSON.parse(localStorage.getItem('ilv_carte') || 'null');
          if (memo) return construire(memo.menu, memo.dispo, memo.stock, false);
        } catch (e) {}
        chargerAppliCommande();
      });
    }
    chargerAppliCommande();
  }

  function chargerAppliCommande() {
    lire('menu', function (menu) {
      lire('config/availability', function (dispo) {
        lire('config/stock', function (stock) { construire(menu, dispo || {}, stock || {}, true); },
             function () { construire(menu, dispo || {}, {}, true); });
      }, function () { construire(menu, {}, {}, true); });
    }, function (raison) {
      // Pas de réseau : on garde la dernière carte connue.
      try {
        var memo = JSON.parse(localStorage.getItem('ilv_carte') || 'null');
        if (memo) return construire(memo.menu, memo.dispo, memo.stock, false);
      } catch (e) {}
      journal('Carte indisponible (' + raison + ')');
    });
  }

  /* ---------- Réglages à distance ---------- */
  var versionVue = null;  // la versionAppli lue en ligne au démarrage
  function chargerReglages() {
    if (!EN_LIGNE) return;
    lire('', function (r) {
      if (!r || typeof r !== 'object') return;
      var sonAvant = cleSon();
      // Nouvelle version de l'écran publiée en ligne (versionAppli changée) : on relance pour la prendre.
      if (r.versionAppli != null) {
        if (versionVue === null) versionVue = r.versionAppli;
        else if (r.versionAppli !== versionVue) {
          try { localStorage.setItem('ilv_reglages', JSON.stringify(r)); } catch (e) {}
          location.replace('index.html' + location.search);
          return;
        }
      }
      appliquerReglages(r);
      recuEnLigne = true;
      try { localStorage.setItem('ilv_reglages', JSON.stringify(r)); } catch (e) {}
      if (lecteur) lecteur.volume = volume();
      if (cleSon() !== sonAvant && mode === 'vitrine') appliquerMode();   // musique, radio ou son de la box changés à distance
      // Si la prise de la box a été changée à distance, on y va tout de suite.
      if (sources.length) { var avant = position; if (placerEntree() && position !== avant) montrerSource(); }
      textes();
      if (menuBrut) montrerMoment();
    }, function () { /* pas de réseau : on garde les réglages qu'on a */ }, EN_LIGNE + 'reglages.json?t=' + new Date().getTime());
  }

  function construire(menu, dispo, stock, frais) {
    if (frais) { try { localStorage.setItem('ilv_carte', JSON.stringify({ menu: menu, dispo: dispo, stock: stock })); } catch (e) {} }
    var tous = [], code, item, st, i;
    for (code in menu) {
      if (!menu.hasOwnProperty(code)) continue;
      item = menu[code];
      if (!item || !item.active || !CATEGORIES[item.category]) continue;
      // Une pizza sans ingrédients (pizza « libre », formule…) ne se présente pas bien à l'écran.
      // (La pizza dessert passe quand même : dans la caisse CODART, elle n'a pas d'ingrédients.)
      if (item.category !== 'desserts' && item.category !== 'pizza_dessert' && !(item.baseIngredients && item.baseIngredients.length)) continue;
      st = stock[code];
      item.code = code;
      item.dispo = dispo[code] !== false && !(st !== undefined && st !== null && st !== -1 && st <= 0);
      tous.push(item);
    }
    tous.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    menuBrut = menu; carte = tous; plats = [];
    var epuises = [];
    for (i = 0; i < tous.length; i++) {
      if (tous[i].category === 'desserts') continue;
      if (tous[i].dispo) plats.push(tous[i]); else epuises.push(tous[i].name);
    }
    $('rupture').textContent = epuises.length ? 'Victime de son succès ce soir : ' + epuises.join(', ') : '';
    montrerMoment();
    if (!enPause) page = 0; // en pause, on garde les mêmes pizzas à l'écran (seuls les prix se mettent à jour)
    montrerPage();
    $('journal').style.display = 'none';
  }

  /* ================= MODE MATCH ================= */
  // Le code de la pizza du moment : celle « mise en avant » dans la caisse CODART (réglage momentDepuisCaisse),
  // sinon celle des réglages.
  function codeDuMoment() {
    var code = R.pizzaDuMoment, c;
    if (R.momentDepuisCaisse !== false && menuBrut) {
      for (c in menuBrut) if (menuBrut.hasOwnProperty(c) && menuBrut[c] && menuBrut[c].enAvant && /^base_/.test(menuBrut[c].category)) { code = c; break; }
    }
    return code;
  }

  function montrerMoment() {
    var code = codeDuMoment(), item, bloc = $('moment');
    item = menuBrut && menuBrut[code];
    if (!item || !item.active) { bloc.style.display = 'none'; return; }
    bloc.style.display = 'block';
    bloc.innerHTML = '<div class="etiquette">La pizza du moment</div>' + photo(code, item.name) +
      '<div class="nom">' + echapper(item.name) + '</div>' +
      '<div class="ingr">' + echapper(ingredients(item)) + '</div>' +
      '<div class="prix">' + prix(item.price) + '</div>';
  }

  function carteHtml(item) {
    return '<div class="carte">' + photo(item.code, item.name) +
      '<div class="txt"><div class="nom">' + echapper(item.name) + '</div>' +
      '<div class="ingr">' + echapper(ingredients(item)) + '</div>' +
      '<div class="prix">' + prix(item.price) + '</div></div></div>';
  }

  function nombre(v, sinon) { return typeof v === 'number' ? v : sinon; }
  function eclaircir(el, l) {
    if (!el || l === 1) return;
    el.style.webkitFilter = 'brightness(' + l + ')'; el.style.filter = 'brightness(' + l + ')';
  }

  function montrerPage() {
    var boite = $('cartes');
    if (!plats.length) { boite.innerHTML = ''; return; }
    var parPage = 3, debut = (page * parPage) % plats.length, html = '';
    for (var i = 0; i < Math.min(parPage, plats.length); i++) html += carteHtml(plats[(debut + i) % plats.length]);
    boite.style.opacity = 0;
    setTimeout(function () {
      boite.innerHTML = html;
      // La TV affiche le milieu du bas plus sombre : on éclaircit la 2e case, la photo et le texte chacun de leur côté
      // (réglages luminositeMilieuPhoto et luminositeMilieuTexte, 1 = normal, 2 = deux fois plus lumineux).
      var milieu = boite.children[1];
      if (milieu) {
        eclaircir(milieu.querySelector('.photo'), nombre(R.luminositeMilieuPhoto, nombre(R.luminositeMilieu, 1.6)));
        eclaircir(milieu.querySelector('.txt'), nombre(R.luminositeMilieuTexte, nombre(R.luminositeMilieu, 2)));
      }
      boite.style.opacity = 1;
    }, 600);
  }

  function textes() {
    if (R.promoTexte) {
      $('promo').style.display = '';
      $('promo-titre').textContent = R.promoTitre || ''; $('promo-texte').textContent = R.promoTexte;
    } else $('promo').style.display = 'none';
  }

  // Le dessert en bas à droite du mode match, qui change doucement.
  var nMatchDessert = 0;
  function matchDessert(sens) {
    var bloc = $('m-dessert');
    if (!R.desserts || !R.desserts.length) { bloc.style.display = 'none'; return; }
    bloc.style.display = '';
    var n = R.desserts.length;
    if (sens < 0) nMatchDessert = (nMatchDessert - 2 + 2 * n) % n; // gauche : le dessert d'avant
    var d = R.desserts[nMatchDessert % n];
    nMatchDessert = (nMatchDessert + 1) % n;
    bloc.style.opacity = 0;
    setTimeout(function () {
      bloc.innerHTML = image('img/desserts/' + d.photo + '.png') +
        '<div class="txt"><div class="etiquette">Nos desserts</div><div class="nom">' + echapper(d.nom) + '</div>' +
        (d.prix ? '<div class="prix">' + echapper(d.prix) + '</div>' : '') + '</div>';
      bloc.style.opacity = 1;
    }, 800);
  }

  /* ================= MODE VITRINE ================= */
  // L'ordre de passage des écrans ; « pizza » = la pizza suivante en grand.
  // Les desserts reviennent souvent : c'est eux qu'on veut faire voir.
  var PROGRAMME = ['desserts', 'pizza', 'dessert', 'pizza', 'affiche', 'dessert', 'pizza', 'carte', 'dessert', 'pizza', 'dessert'];
  var etape = 0, nPizza = 0, nAffiche = 0, minuteur = null, fondu = null;
  // PAUSE de la télécommande : plus rien ne défile (vitrine et match). LECTURE : ça repart.
  var enPause = false;
  function pause(oui) {
    if (oui === enPause) return;
    enPause = oui;
    annoncer(oui ? 'Pause' : 'Lecture', 2500);
    if (!oui && mode === 'vitrine') vitrineSuivante(); // on repart tout de suite sur l'écran suivant
    if (oui) clearTimeout(minuteur);
  }
  // Les derniers écrans montrés, pour pouvoir revenir en arrière avec la flèche gauche.
  var passe = [];

  function diapo(id, remplir) {
    var toutes = document.querySelectorAll('.diapo'), i;
    for (i = 0; i < toutes.length; i++) toutes[i].className = 'diapo';
    clearTimeout(fondu); // si on appuie vite plusieurs fois, seul le dernier écran s'affiche
    fondu = setTimeout(function () { remplir($(id)); $(id).className = 'diapo visible'; }, 800);
  }

  function ecranPizza(el) {
    var liste = [], i;
    for (i = 0; i < plats.length; i++) if (PHOTOS.indexOf(plats[i].code) >= 0 || plats[i].image) liste.push(plats[i]);
    if (!liste.length) liste = plats;
    var p = liste[nPizza++ % liste.length];
    el.innerHTML = photo(p.code, p.name) +
      '<div class="txt"><div class="etiquette">' + echapper(CATEGORIES[p.category]) + '</div>' +
      '<div class="nom">' + echapper(p.name) + '</div>' +
      '<div class="ingr">' + echapper(ingredients(p)) + '</div>' +
      '<div class="prix">' + prix(p.price) + '</div></div>';
  }

  var nDessert = 0;
  function ecranDessert(el) {
    var d = R.desserts[nDessert++ % R.desserts.length];
    el.innerHTML = image('img/desserts/' + d.photo + '.png') +
      '<div class="txt"><div class="etiquette">Nos desserts</div>' +
      '<div class="nom">' + echapper(d.nom) + '</div>' +
      (d.prix ? '<div class="prix">' + echapper(d.prix) + '</div>' : '') +
      '<div class="phrase">Une touche de gourmandise pour finir votre repas</div></div>';
  }

  function ecranCarte(el) {
    var colonnes = [
      { titre: 'Base crème', cats: { base_creme: 1 } },
      { titre: 'Base tomate', cats: { base_tomate: 1 } },
      { titre: 'Douceurs', cats: { pizza_dessert: 1, desserts: 1 } }
    ], html = '', c, i, p, moment = codeDuMoment(), pm = null;
    // Une ligne de la carte (pizza ou dessert).
    function ligne(p) {
      return '<div class="ligne' + (p.dispo ? '' : ' epuise') + '"><div class="haut">' +
        '<span class="nom">' + echapper(p.name) + '</span>' +
        (p.dispo ? '' : '<span class="badge">victime de son succès</span>') +
        '<span class="points"></span><span class="prix">' + prix(p.price) + '</span></div>' +
        (p.category === 'desserts' ? '' : '<div class="ingr">' + echapper(ingredients(p)) + '</div>') + '</div>';
    }
    for (c = 0; c < colonnes.length; c++) {
      html += '<div class="colonne"><div class="etiquette">' + colonnes[c].titre + '</div>';
      for (i = 0; i < carte.length; i++) {
        p = carte[i];
        if (!colonnes[c].cats[p.category]) continue;
        // La pizza du moment ne reste pas dans sa colonne : elle va en bas des Douceurs (sinon la colonne déborde).
        if (p.code === moment && /^base_/.test(p.category)) { pm = p; continue; }
        html += ligne(p);
      }
      if (colonnes[c].titre === 'Douceurs') {
        for (i = 0; i < (R.desserts || []).length; i++) {
          html += '<div class="ligne"><div class="haut"><span class="nom">' + echapper(R.desserts[i].nom) + '</span>' +
            '<span class="points"></span><span class="prix">' + echapper(R.desserts[i].prix) + '</span></div></div>';
        }
        if (pm) html += '<div class="etiquette moment">La pizza du moment</div>' + ligne(pm);
      }
      html += '</div>';
    }
    el.innerHTML = html;
  }

  function ecranDesserts(el) {
    var html = '<div class="titre">Nos desserts</div><div class="rangee">', i, d;
    for (i = 0; i < R.desserts.length; i++) {
      d = R.desserts[i];
      html += '<div class="pot">' + image('img/desserts/' + d.photo + '.png') +
        '<div class="nom">' + echapper(d.nom) + '</div>' +
        (d.prix ? '<div class="prix">' + echapper(d.prix) + '</div>' : '') + '</div>';
    }
    el.innerHTML = html + '</div><div class="bas">Une touche de gourmandise pour finir votre repas</div>';
  }

  function ecranAffiche(el) {
    el.innerHTML = image('img/affiches/' + R.affiches[nAffiche++ % R.affiches.length]);
  }

  function possible(type) {
    if (type === 'pizza' || type === 'carte') return plats.length > 0;
    if (type === 'desserts' || type === 'dessert') return !!(R.desserts && R.desserts.length);
    if (type === 'affiche') return !!(R.affiches && R.affiches.length);
    return false;
  }

  function vitrineSuivante() {
    clearTimeout(minuteur);
    if (mode !== 'vitrine') return;
    passe.push({ etape: etape, nPizza: nPizza, nDessert: nDessert, nAffiche: nAffiche });
    if (passe.length > 30) passe.shift();
    // On saute ce qui n'a pas de contenu (carte pas encore arrivée, pas de desserts, pas d'affiche).
    var type, essais = 0, duree;
    do { type = PROGRAMME[etape++ % PROGRAMME.length]; } while (!possible(type) && ++essais < PROGRAMME.length);
    if (!possible(type)) { minuteur = setTimeout(vitrineSuivante, 3000); return; }
    if (type === 'pizza') { diapo('d-vedette', ecranPizza); duree = R.vitrinePizzaSecondes; }
    else if (type === 'dessert') { diapo('d-dessert', ecranDessert); duree = R.vitrineDessertSecondes; }
    else if (type === 'carte') { diapo('d-carte', ecranCarte); duree = R.vitrineCarteSecondes; }
    else if (type === 'desserts') { diapo('d-desserts', ecranDesserts); duree = R.vitrineDessertsSecondes; }
    else { diapo('d-affiche', ecranAffiche); duree = R.vitrineAfficheSecondes; }
    if (!enPause) minuteur = setTimeout(vitrineSuivante, (duree || 20) * 1000);
  }

  // Flèche gauche en vitrine : on remet l'écran d'avant (le même plat, le même dessert).
  function vitrinePrecedente() {
    if (mode !== 'vitrine' || passe.length < 2) return;
    passe.pop();                // l'écran actuel
    var avant = passe.pop();    // celui d'avant (vitrineSuivante va le remettre dans la liste)
    etape = avant.etape; nPizza = avant.nPizza; nDessert = avant.nDessert; nAffiche = avant.nAffiche;
    vitrineSuivante();
  }

  /* ================= L'IMAGE DE LA BOX (sur la TV) ================= */
  var sources = [], position = 0, sourcesLues = false, minuteurEntree = null;

  function nomEntree(s) { return s.type + ' ' + s.number; }
  function simple(t) { return String(t || '').replace(/\s+/g, '').toUpperCase(); }

  // Réglage entreeBox (ex. 'HDMI 2') : le mode match va toujours sur cette prise. Renvoie vrai si elle est trouvée.
  function placerEntree() {
    if (!R.entreeBox) return false;
    for (var i = 0; i < sources.length; i++) {
      if (simple(nomEntree(sources[i])) === simple(R.entreeBox)) { position = i; return true; }
    }
    return false;
  }

  // Affiche quelques secondes un petit message en haut à gauche (nom de l'entrée, Pause, Lecture).
  function annoncer(texte, ms) {
    var e = $('entree');
    e.textContent = texte;
    e.style.display = 'block';
    clearTimeout(minuteurEntree);
    minuteurEntree = setTimeout(function () { e.style.display = 'none'; }, ms || 6000);
  }
  function annoncerEntree(texte) { annoncer(texte, 6000); }

  // En vitrine avec le son de la box : l'image de la box est réduite à un point dans le coin, on n'entend que le son.
  var ZONE_SON = ['1916px', '1076px', '4px', '4px'];
  function sonDeLaBox() { return R.sonVitrine === 'box'; }

  function montrerSource() {
    if (!SUR_TV || !sources.length) return;
    if (mode !== 'match' && !sonDeLaBox()) return;
    var s = sources[position], zone = mode === 'match' ? ZONE_VIDEO : ZONE_SON;
    if (mode === 'match') annoncerEntree(nomEntree(s) + (R.entreeBox ? '' : ' — gauche / droite pour changer'));
    tizen.tvwindow.setSource(s, function () {
      tizen.tvwindow.show(function () {}, function (e) { journal('Image refusée : ' + (e && e.message)); }, zone, 'MAIN');
    }, function () { journal('Entrée ' + s.type + ' ' + s.number + ' refusée'); });
  }

  function cacherVideo() {
    if (!SUR_TV) return;
    try { tizen.tvwindow.hide(function () {}, function () {}, 'MAIN'); } catch (x) {}
  }

  function lireSources() {
    sourcesLues = true;
    tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (vs) {
      // Sur cette TV, les prises HDMI apparaissent parfois dans « non branchées » : on prend les deux listes.
      var tout = (vs.connected || []).concat(vs.disconnected || []), i, memo = null;
      for (i = 0; i < tout.length; i++) if (tout[i].type === 'HDMI') sources.push(tout[i]);
      for (i = 0; i < tout.length; i++) if (tout[i].type !== 'HDMI') sources.push(tout[i]);
      try { memo = localStorage.getItem('ilv_source'); } catch (x) {}
      for (i = 0; i < sources.length; i++) if (sources[i].type + sources[i].number === memo) position = i;
      placerEntree(); // la prise fixée dans les réglages passe avant le dernier choix fait à la télécommande
      montrerSource();
    }, function () { journal('Entrées de la TV illisibles'); });
  }

  // Gauche / droite en match (quand la prise de la box est fixée) : les pizzas du bas et le dessert défilent à la main.
  var dernierAppui = 0;
  function matchDefiler(pas) {
    dernierAppui = Date.now();
    page = page + pas < 0 ? Math.max(0, Math.ceil(plats.length / 3) - 1) : page + pas;
    montrerPage();
    matchDessert(pas);
  }
  function apresAppui(cle) { return Date.now() - dernierAppui < Math.max(5, R[cle] || 20) * 1000 - 500; }

  function changerSource(pas) {
    if (!sources.length || mode !== 'match') return;
    if (R.entreeBox && placerEntree()) { annoncerEntree(nomEntree(sources[position]) + ' (prise de la box)'); return; }
    position = (position + pas + sources.length) % sources.length;
    try { localStorage.setItem('ilv_source', sources[position].type + sources[position].number); } catch (x) {}
    montrerSource();
  }

  /* ================= Passer d'un mode à l'autre ================= */
  // ---- La musique de la vitrine (réglage sonVitrine) ----
  //   'playlist' : les morceaux de « musiques » (un nom = un fichier du dossier musique/, ou une adresse internet), en boucle ;
  //   'radio'    : la radio internet à l'adresse « radio ». Si elle ne répond pas 3 fois de suite : la playlist à la place.
  // Un changement de ces réglages reçu d'internet change la musique tout de suite (sans réinstaller).
  var lecteur = null, ecoute = '';   // ecoute : les réglages avec lesquels le lecteur a été fait
  function cleSon() { return R.sonVitrine + '|' + (R.sonVitrine === 'radio' ? R.radio || '' : '') + '|' + (R.musiques || []).join('|'); }
  function adresseSon(nom) { return /^https?:/.test(nom) ? nom : 'musique/' + nom; }
  function arreterMusique() {
    if (!lecteur) return;
    var l = lecteur; lecteur = null;
    try { l.pause(); l.removeAttribute('src'); l.load(); } catch (e) {}
  }
  function creerLecteur(liste, radio) {
    var l = new Audio(), morceau = 0, pannes = 0, auHasard = !radio;
    lecteur = l;
    l.volume = volume();
    function actif() { return lecteur === l; }   // un ancien lecteur remplacé ne fait plus rien
    function jouer(n) { morceau = n % liste.length; l.src = adresseSon(liste[morceau]); lancer(); }
    l.onended = function () { if (actif()) jouer(radio ? 0 : morceau + 1); };   // radio coupée : on se reconnecte
    l.onplaying = function () { pannes = 0; };
    // Au tout premier morceau (pas pour la radio), on part d'un endroit au hasard.
    l.onloadedmetadata = function () {
      if (!auHasard) return;
      auHasard = false;
      if (isFinite(l.duration) && l.duration > 600) l.currentTime = Math.floor(Math.random() * (l.duration - 300));
    };
    // Sur la TV, le lecteur signale parfois une erreur passagère : rien n'est montré aux clients, on relance.
    l.onerror = function () {
      if (!actif()) return;
      pannes++;
      if (radio && pannes >= 3 && (R.musiques || []).length) {   // la radio ne répond pas : notre playlist
        arreterMusique();
        creerLecteur(R.musiques, false);
        return;
      }
      setTimeout(function () { if (actif()) jouer(radio ? 0 : morceau + 1); }, radio ? 10000 : 3000);
    };
    l.src = adresseSon(liste[0]);
  }
  function musique(jouer) {
    var cle = cleSon();
    if (lecteur && cle !== ecoute) arreterMusique();   // les réglages du son ont changé
    if (!lecteur) {
      ecoute = cle;
      if (R.sonVitrine === 'radio' && R.radio) creerLecteur([R.radio], true);
      else if ((R.sonVitrine === 'playlist' || R.sonVitrine === 'radio') && (R.musiques || []).length) creerLecteur(R.musiques, false);
      else return;
    }
    if (jouer) lancer(); else lecteur.pause();
  }
  function volume() {
    var v = typeof R.volumeMusique === 'number' ? R.volumeMusique : 40;
    return Math.max(0, Math.min(100, v)) / 100;
  }
  function lancer() {
    var p = lecteur.play();
    if (p && p.catch) p.catch(function () {});
  }

  function appliquerMode() {
    $('scene').className = 'mode-' + mode;
    if (mode === 'match') {
      clearTimeout(minuteur);
      musique(false);
      if (!SUR_TV) $('apercu').style.display = 'block';
      else if (!sourcesLues) lireSources();
      else montrerSource();
    } else {
      if (SUR_TV && sonDeLaBox()) { if (!sourcesLues) lireSources(); else montrerSource(); }
      else cacherVideo();
      musique(true);
      vitrineSuivante();
    }
  }

  document.addEventListener('keydown', function (ev) {
    var k = ev.keyCode;
    // Flèche droite : en vitrine, écran suivant ; en match, pizzas et dessert suivants (ou entrée suivante si aucune prise fixée).
    if (k === 39) { if (mode === 'vitrine') vitrineSuivante(); else if (R.entreeBox) matchDefiler(1); else changerSource(1); }
    // Flèche gauche : pareil, vers l'arrière.
    if (k === 37) { if (mode === 'vitrine') vitrinePrecedente(); else if (R.entreeBox) matchDefiler(-1); else changerSource(-1); }
    // Chaîne + / − ne sont plus captées par l'appli : elles restent pour la box.
    if (k === 19) pause(true);              // PAUSE
    if (k === 415) pause(false);            // LECTURE
    if (k === 10252) pause(!enPause);       // touche unique lecture/pause
    if (k === 38 || k === 40) {                     // flèche haut ou bas : match <-> vitrine
      mode = mode === 'match' ? 'vitrine' : 'match';
      appliquerMode();
    }
    if (k === 10009 && SUR_TV) {                    // RETOUR : quitter
      cacherVideo();
      tizen.application.getCurrentApplication().exit();
    }
  });

  /* ---------- Démarrage ---------- */
  window.addEventListener('resize', ajuster);
  ajuster();
  horloge();
  textes();
  // Les minuteries relisent les réglages à chaque tour : un changement reçu d'internet est pris tout de suite.
  if (SUR_TV) {
    try { tizen.tvinputdevice.registerKey('MediaPause'); } catch (x) {}
    try { tizen.tvinputdevice.registerKey('MediaPlay'); } catch (x) {}
    try { tizen.tvinputdevice.registerKey('MediaPlayPause'); } catch (x) {}
  }
  function chaque(cle, unite, faire) {
    (function tour() { setTimeout(function () { faire(); tour(); }, Math.max(5, R[cle] || 20) * unite); })();
  }
  matchDessert();
  chaque('matchDessertSecondes', 1000, function () { if (!enPause && !apresAppui('matchDessertSecondes')) matchDessert(1); });
  setInterval(horloge, 10000);
  chargerReglages();
  chargerCarte();
  chaque('rechargementMinutes', 60000, function () { chargerReglages(); chargerCarte(); });
  chaque('defilementSecondes', 1000, function () { if (mode === 'match' && !enPause && !apresAppui('defilementSecondes')) { page++; montrerPage(); } });
  // Lancé par le lanceur (index.html) après le chargement de la page : on applique le mode tout de suite.
  if (document.readyState === 'complete') appliquerMode(); else window.onload = appliquerMode;
  window.ILV_PRET = true;  // pour le lanceur : tout a démarré sans erreur
})();
