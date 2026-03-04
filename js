/* ============================================================
   BatiPilot — Service Worker v16
   ============================================================
   DÉPLOIEMENT : Ce fichier doit être placé à la RACINE du repo,
   dans le même dossier que index.html (ou batipilot_v12.html).

   GitHub Pages example :
     repo/
     ├── index.html          ← votre app BatiPilot
     └── sw.js               ← ce fichier ici

   Si votre repo s'appelle "gestion_chantier", adaptez STATIC_ASSETS.
   ============================================================ */
'use strict';

/* ── Version du cache ──────────────────────────────────────── */
/* ⚠️  Incrémentez CACHE_VERSION à chaque déploiement pour
       forcer le rechargement chez tous les utilisateurs.      */
var CACHE_VERSION = 'batipilot-v16';
var CACHE_NAME    = CACHE_VERSION;

/* ── Assets à précacher à l'installation ──────────────────── */
/* Adaptez les chemins selon le nom de votre repo GitHub Pages  */
var STATIC_ASSETS = [
  '/',
  '/index.html',
  /* Si votre HTML s'appelle autrement : */
  /* '/batipilot_v12.html', */
  /* Si hébergé dans un sous-répertoire GitHub Pages :          */
  /* '/gestion_chantier/', '/gestion_chantier/index.html',     */
];

/* ── Domaines exclus du cache (APIs temps-réel) ───────────── */
var BYPASS_PATTERNS = [
  'supabase.co',      // Supabase REST, Auth, Storage
  'googleapis.com',   // Google Fonts
  'stripe.com',       // Stripe checkout & webhooks
  'placehold.co',     // Placeholders images
];

/* ── INSTALL : précache des assets critiques ──────────────── */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(STATIC_ASSETS).catch(function(err) {
          /* Silencieux : asset manquant ne bloque pas l'install */
          console.warn('[SW] Précache partiel :', err);
        });
      })
      .then(function() {
        /* Activer immédiatement sans attendre la fermeture des onglets */
        return self.skipWaiting();
      })
  );
});

/* ── ACTIVATE : nettoyage des anciens caches ──────────────── */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) {
              console.log('[SW] Suppression ancien cache :', k);
              return caches.delete(k);
            })
        );
      })
      .then(function() {
        /* Prendre le contrôle de tous les onglets ouverts */
        return self.clients.claim();
      })
  );
});

/* ── FETCH : Stale-While-Revalidate ───────────────────────── */
/*
   Stratégie :
   1. Répondre immédiatement avec le cache (si dispo) → 0 latence perçue
   2. Mettre à jour le cache en arrière-plan via le réseau
   3. Si réseau KO ET pas de cache → erreur réseau (l'app gère via IndexedDB)
*/
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  /* 1. Ignorer les requêtes non-GET (POST, PUT, DELETE → Supabase) */
  if (e.request.method !== 'GET') return;

  /* 2. Bypass les APIs temps-réel */
  var isBypass = BYPASS_PATTERNS.some(function(p) {
    return url.indexOf(p) >= 0;
  });
  if (isBypass) return;

  /* 3. Ignorer les URLs non-HTTP (chrome-extension://, etc.) */
  if (!url.startsWith('http')) return;

  /* 4. Stale-While-Revalidate */
  e.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(e.request).then(function(cached) {

        var networkFetch = fetch(e.request)
          .then(function(response) {
            /* Mettre en cache uniquement les réponses 200 */
            if (response && response.status === 200) {
              cache.put(e.request, response.clone());
            }
            return response;
          })
          .catch(function() {
            /* Réseau KO : retourner le cache ou laisser l'erreur remonter */
            if (cached) return cached;
            /* Retourner une page offline basique si rien en cache */
            return new Response(
              '<html><body style="font-family:sans-serif;text-align:center;padding:40px">'
              + '<h2>📶 Hors ligne</h2>'
              + '<p>L\'application BatiPilot est en cours de chargement…</p>'
              + '<p>Vos données locales sont disponibles — reconnectez-vous pour synchroniser.</p>'
              + '</body></html>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });

        /* Retourner le cache immédiatement, réseau en background */
        return cached || networkFetch;
      });
    })
  );
});

/* ── MESSAGE : contrôle depuis l'application principale ───── */
self.addEventListener('message', function(e) {
  if (!e.data) return;

  /* Forcer l'activation d'une nouvelle version */
  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  /* Vider tout le cache (bouton "Vider le cache" dans les paramètres) */
  if (e.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(function() {
      if (e.source) e.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});
