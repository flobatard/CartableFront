/**
 * Mesure d'audience PostHog. Le consentement est demandé AVANT tout dépôt et
 * tout envoi (opt-in strict) : ces réglages disent seulement ce que
 * l'environnement autorise, jamais ce que l'utilisateur a accepté.
 */
export interface AnalyticsConfig {
  /** Coupe tout : ni posthog-js chargé, ni bannière, ni consentement stocké. */
  enabled: boolean;
  /** Project API key PostHog — publique par nature (write-only côté ingestion). */
  posthogKey: string;
  /** Hôte d'ingestion, région comprise (eu.i.posthog.com pour l'UE). */
  posthogHost: string;
  /** Propose l'enregistrement de session comme second choix dans la modale. */
  sessionReplay: boolean;
}

/** Forme commune des environnements (ce fichier n'est jamais remplacé au build). */
export interface AppEnvironment {
  production: boolean;
  apiUrl: string;
  /** Origine absolue du site (sans slash final) : liens SEO canonical/hreflang/og:url. */
  siteUrl: string;
  oidc: {
    issuer: string;
    clientId: string;
    /** Chemins relatifs : l'origine est résolue au runtime navigateur (location.origin). */
    redirectPath: string;
    postLogoutRedirectPath: string;
    scope: string;
    /** 'remoteOnly' autorise http:// pour localhost uniquement. */
    requireHttps: boolean | 'remoteOnly';
    showDebugInformation: boolean;
  };
  analytics: AnalyticsConfig;
}
