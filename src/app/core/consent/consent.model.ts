/** Version du contrat de consentement : l'incrémenter re-demande le choix à tous. */
export const CONSENT_VERSION = 1;

/**
 * Durée de validité d'un choix, refus compris (recommandation CNIL : 6 mois).
 * Au-delà, la bannière repose la question.
 */
export const CONSENT_MAX_AGE_DAYS = 183;

/** Clé de stockage — convention `oc-*` des préférences globales (`oc-theme`, `oc-lang`). */
export const CONSENT_STORAGE_KEY = 'oc-consent';

/** Choix de l'utilisateur, tel que persisté. */
export interface ConsentDecision {
  version: number;
  /** Mesure d'audience (événements PostHog). */
  analytics: boolean;
  /** Enregistrement de session — n'a de sens que si `analytics` est vrai. */
  sessionReplay: boolean;
  /** Date de la décision, ISO 8601 : sert au calcul de péremption. */
  date: string;
}

/** Ce que la modale de préférences renvoie. */
export type ConsentChoice = Pick<ConsentDecision, 'analytics' | 'sessionReplay'>;

/**
 * Relit une valeur brute du storage. Rend `null` — donc « aucun choix » — pour
 * tout ce qui n'est pas une décision exploitable : JSON invalide, forme
 * inattendue, version dépassée, ou choix périmé.
 */
export function parseDecision(raw: string | null, now: Date): ConsentDecision | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const value = parsed as Partial<ConsentDecision>;
  if (
    value.version !== CONSENT_VERSION ||
    typeof value.analytics !== 'boolean' ||
    typeof value.sessionReplay !== 'boolean' ||
    typeof value.date !== 'string'
  ) {
    return null;
  }
  const decidedAt = Date.parse(value.date);
  if (Number.isNaN(decidedAt)) {
    return null;
  }
  const ageDays = (now.getTime() - decidedAt) / 86_400_000;
  if (ageDays > CONSENT_MAX_AGE_DAYS || ageDays < 0) {
    return null;
  }
  return {
    version: value.version,
    analytics: value.analytics,
    // Un replay sans mesure d'audience n'a pas de sens : on le neutralise.
    sessionReplay: value.analytics && value.sessionReplay,
    date: value.date,
  };
}
