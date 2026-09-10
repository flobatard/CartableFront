import type { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  siteUrl: 'http://localhost:4200',
  oidc: {
    issuer: 'https://zitadel.home.fbatard.fr',
    clientId: '380648830682595330',
    redirectPath: '/auth/callback',
    postLogoutRedirectPath: '',
    scope: 'openid profile email offline_access urn:zitadel:iam:org:id:380648680241233922',
    requireHttps: 'remoteOnly',
    showDebugInformation: true,
  },
  // Environnement de `ng serve` (configuration par défaut du dev server).
  // La clé est renseignée mais `enabled` reste à false : rien n'est téléchargé
  // ni demandé. Passer `enabled` à true pour essayer la mesure en local —
  // au prix d'une bannière à chaque session et d'événements de dev mêlés à
  // ceux du projet PostHog visé.
  analytics: {
    enabled: false,
    posthogKey: 'phc_kCaZHPsJxFe7ugGcPmDCYDmuRNWA9eMWcZYfhKAtp83S',
    posthogHost: 'https://eu.i.posthog.com',
    sessionReplay: false,
  },
};
