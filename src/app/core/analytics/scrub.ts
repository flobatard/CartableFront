/**
 * Nettoyage des propriétés envoyées à PostHog.
 *
 * Deux fuites structurelles à fermer, toutes deux dans des propriétés que
 * posthog-js ajoute LUI-MÊME (`$current_url`, `$pathname`, `$referrer`,
 * `$initial_*`, métadonnées de replay…), donc sans passer par nos événements :
 *
 * 1. Le token d'un lien de partage est un SEGMENT D'URL (`/fr/shared/<token>/…`).
 *    C'est une capability URL : l'envoyer donnerait à PostHog, et à quiconque lit
 *    le dashboard, l'accès en clair aux cours partagés.
 * 2. La query string porte des saisies utilisateur (`/fr/search?q=…`).
 *
 * On ne transmet donc que des MOTIFS DE ROUTE : `/fr/shared/:token/blocks/:id`.
 * Le titre du document est retiré pour la même raison (`SeoService` y met le
 * titre du cours consulté).
 *
 * Fonctions pures, sans dépendance à posthog-js : testées isolément.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABSOLUTE_URL = /^([a-z][a-z0-9+.\-]*:\/\/[^/]*)(\/[^\s]*)?$/i;

/** Propriétés retirées d'office : elles portent du contenu, pas de la mesure. */
const DROPPED_PROPERTIES = new Set(['title', '$title']);

/** Profondeur maximale du parcours récursif (garde-fou, les charges sont plates). */
const MAX_DEPTH = 6;

/**
 * Réécrit une URL ou un chemin en motif de route : query et fragment supprimés,
 * le segment qui suit `shared` remplacé par `:token`, tout UUID par `:id`.
 * Une valeur qui n'est ni une URL absolue ni un chemin est rendue telle quelle.
 */
export function scrubUrl(value: string): string {
  const cut = value.replace(/[?#].*$/, '');
  const absolute = ABSOLUTE_URL.exec(cut);

  let origin = '';
  let path: string;
  if (absolute) {
    origin = absolute[1];
    path = absolute[2] ?? '';
  } else if (cut.startsWith('/')) {
    path = cut;
  } else {
    return value;
  }

  const segments = path.split('/');
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i] === '') {
      continue;
    }
    if (segments[i - 1] === 'shared') {
      segments[i] = ':token';
    } else if (UUID.test(segments[i])) {
      segments[i] = ':id';
    }
  }
  return origin + segments.join('/');
}

/** Vrai si la valeur mérite d'être passée à `scrubUrl` (chemin ou URL absolue). */
function looksLikeUrl(value: string): boolean {
  return value.startsWith('/') || ABSOLUTE_URL.test(value);
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    return looksLikeUrl(value) ? scrubUrl(value) : value;
  }
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }
  return scrubProperties(value as Record<string, unknown>, depth + 1);
}

/**
 * Parcours récursif d'un sac de propriétés : retire les propriétés interdites,
 * réécrit toute chaîne qui ressemble à une URL. Le parcours est générique par
 * choix — il couvre aussi les propriétés que posthog-js ajoutera demain.
 */
export function scrubProperties(
  properties: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (DROPPED_PROPERTIES.has(key)) {
      continue;
    }
    scrubbed[key] = scrubValue(value, depth);
  }
  return scrubbed;
}

/** Forme minimale d'un événement PostHog — on ne dépend pas de ses types. */
export interface CaptureLike {
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/**
 * Nettoyage d'un événement sortant, **en place** — c'est le hook `before_send`
 * de posthog-js, qui attend la charge utile elle-même en retour. S'applique
 * aussi aux événements émis par la bibliothèque (`$pageview`, `$pageleave`,
 * propriétés de personne, métadonnées de replay).
 */
export function scrubEvent(event: CaptureLike | null | undefined): void {
  if (!event) {
    return;
  }
  if (event.properties) {
    event.properties = scrubProperties(event.properties);
  }
  if (event.$set) {
    event.$set = scrubProperties(event.$set);
  }
  if (event.$set_once) {
    event.$set_once = scrubProperties(event.$set_once);
  }
}

/**
 * Vrai pour une URL de page élève (lien de partage, cours public, catalogue
 * d'un prof). Ces pages ne sont jamais enregistrées en session replay : elles
 * afficheraient les réponses saisies par des élèves, souvent mineurs.
 */
export function isStudentUrl(url: string): boolean {
  return /^\/[^/]+\/(shared|p)(\/|$)/.test(url.replace(/[?#].*$/, ''));
}
