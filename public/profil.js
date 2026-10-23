/**
 * public/profil.js
 * Gestion du profil joueur et des données par personnage.
 * Toutes les opérations localStorage sont protégées par try/catch.
 */
(function () {
  'use strict';

  // Clé principale du profil dans localStorage
  var PROFIL_KEY = 'ens.profil';

  // Valeurs par défaut du profil (fusionnées à la lecture)
  var DEFAULTS = {
    name: '',
    active: null,
    chars: {},
    settings: {
      sound: true,
      follow: true
    }
  };

  /**
   * Fusionne récursivement l'objet source dans la cible (cible est modifiée).
   * @param {Object} cible
   * @param {Object} source
   * @returns {Object}
   */
  function deepMerge(cible, source) {
    for (var k in source) {
      if (Object.prototype.hasOwnProperty.call(source, k)) {
        if (
          source[k] !== null &&
          typeof source[k] === 'object' &&
          !Array.isArray(source[k]) &&
          cible[k] !== null &&
          typeof cible[k] === 'object' &&
          !Array.isArray(cible[k])
        ) {
          deepMerge(cible[k], source[k]);
        } else {
          cible[k] = source[k];
        }
      }
    }
    return cible;
  }

  /**
   * Lit une valeur localStorage de façon sécurisée.
   * @param {string} key
   * @returns {string|null}
   */
  function lsGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  /**
   * Écrit une valeur localStorage de façon sécurisée.
   * @param {string} key
   * @param {string} value
   */
  function lsSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // Quota dépassé ou stockage indisponible : on ignore silencieusement
    }
  }

  /**
   * Supprime une clé localStorage de façon sécurisée.
   * @param {string} key
   */
  function lsRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      // Ignoré
    }
  }

  /**
   * Récupère la liste des clés localStorage commençant par un préfixe donné.
   * @param {string} prefixe
   * @returns {string[]}
   */
  function lsKeysByPrefix(prefixe) {
    var result = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(prefixe) === 0) {
          result.push(k);
        }
      }
    } catch (e) {
      // Ignoré
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // API publique exposée sur window.Profil
  // ---------------------------------------------------------------------------

  window.Profil = {

    /**
     * Récupère le profil complet (fusionné avec les valeurs par défaut).
     * @returns {Object}
     */
    get: function () {
      var raw = lsGet(PROFIL_KEY);
      if (!raw) {
        // Retourne une copie profonde des valeurs par défaut
        return structuredClone(DEFAULTS);
      }
      try {
        var stored = JSON.parse(raw);
        // Fusionne les valeurs stockées sur les valeurs par défaut
        return deepMerge(structuredClone(DEFAULTS), stored);
      } catch (e) {
        // JSON invalide : on retombe sur les valeurs par défaut
        return structuredClone(DEFAULTS);
      }
    },

    /**
     * Enregistre le profil complet dans localStorage.
     * @param {Object} p - Objet profil à sauvegarder
     */
    set: function (p) {
      lsSet(PROFIL_KEY, JSON.stringify(p));
    },

    /**
     * Indique si un profil existe déjà dans localStorage.
     * @returns {boolean}
     */
    exists: function () {
      return lsGet(PROFIL_KEY) !== null;
    },

    /**
     * Retourne l'identifiant du personnage actif.
     * @returns {string|null}
     */
    active: function () {
      return this.get().active;
    },

    /**
     * Définit le personnage actif.
     * @param {string} id - Identifiant du personnage
     */
    setActive: function (id) {
      var profil = this.get();
      profil.active = id;
      this.set(profil);
    },

    /**
     * Crée ou met à jour un personnage dans le profil.
     * Fusionne les infos fournies dans chars[id] puis enregistre.
     * @param {string} id - Identifiant du personnage
     * @param {Object} info - Informations à fusionner
     */
    upsertChar: function (id, info) {
      var profil = this.get();
      if (!profil.chars[id]) {
        profil.chars[id] = {};
      }
      deepMerge(profil.chars[id], info);
      this.set(profil);
    },

    /**
     * Supprime un personnage du profil.
     * @param {string} id - Identifiant du personnage à retirer
     */
    removeChar: function (id) {
      var profil = this.get();
      delete profil.chars[id];
      // Si le personnage supprimé était actif, on réinitialise
      if (profil.active === id) {
        profil.active = null;
      }
      this.set(profil);
    },

    /**
     * Construit la clé localStorage pour une donnée spécifique d'un personnage.
     * @param {string} k - Nom de la donnée
     * @returns {string}
     */
    key: function (k) {
      return 'ens.c.' + this.active() + '.' + k;
    },

    /**
     * Charge une donnée spécifique du personnage actif.
     * @param {string} k - Nom de la donnée
     * @param {*} def - Valeur par défaut (retournée en copie profonde si absente)
     * @returns {*}
     */
    load: function (k, def) {
      var raw = lsGet(this.key(k));
      if (raw === null) {
        return structuredClone(def);
      }
      try {
        return JSON.parse(raw);
      } catch (e) {
        return structuredClone(def);
      }
    },

    /**
     * Sauvegarde une donnée spécifique du personnage actif.
     * @param {string} k - Nom de la donnée
     * @param {*} v - Valeur à sérialiser
     */
    save: function (k, v) {
      lsSet(this.key(k), JSON.stringify(v));
    },

    /**
     * Exporte toutes les données 'ens.' dans une chaîne JSON.
     * @returns {string}
     */
    exportAll: function () {
      var data = {};
      var keys = lsKeysByPrefix('ens.');
      for (var i = 0; i < keys.length; i++) {
        data[keys[i]] = lsGet(keys[i]);
      }
      var payload = {
        app: 'compagnon-enshrouded',
        version: 1,
        at: Date.now(),
        data: data
      };
      return JSON.stringify(payload);
    },

    /**
     * Importe des données depuis une chaîne JSON.
     * Vérifie l'application, supprime les clés 'ens.' existantes puis réécrit.
     * @param {string} text - Chaîne JSON à importer
     * @throws {Error} Si le format est invalide
     */
    importAll: function (text) {
      var payload;
      try {
        payload = JSON.parse(text);
      } catch (e) {
        throw new Error('Import invalide : le texte fourni n\'est pas un JSON valide.');
      }

      // Vérification de l'application d'origine
      if (!payload || payload.app !== 'compagnon-enshrouded') {
        throw new Error('Import invalide : l\'application source n\'est pas « compagnon-enshrouded ».');
      }

      // Vérification que data est un objet
      if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
        throw new Error('Import invalide : le champ « data » est absent ou n\'est pas un objet.');
      }

      // Suppression de toutes les clés 'ens.' existantes
      var existing = lsKeysByPrefix('ens.');
      for (var i = 0; i < existing.length; i++) {
        lsRemove(existing[i]);
      }

      // Écriture des nouvelles données
      for (var k in payload.data) {
        if (Object.prototype.hasOwnProperty.call(payload.data, k)) {
          lsSet(k, payload.data[k]);
        }
      }
    }
  };
})();
