import {
  ApplicationConfig,
  effect,
  inject,
  PLATFORM_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { isPlatformBrowser, PlatformLocation } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { NavigationEnd, provideRouter, Router, RouteReuseStrategy } from '@angular/router';
import { filter } from 'rxjs/operators';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { MemoryStorage, OAuthStorage, provideOAuthClient } from 'angular-oauth2-oidc';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { AnalyticsService } from './core/analytics/analytics.service';
import { AuthService } from './core/auth/auth.service';
import { TranslocoImportLoader } from './core/i18n/transloco-loader';
import { langFromPath, LanguageService } from './core/i18n/language.service';
import { RemountOnParamChangeStrategy } from './core/routing/remount-on-param-change.strategy';
import { provideMarkdownExtensions } from './shared/markdown-extensions/markdown-extensions.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Les pages d'édition (params en snapshot) remontent quand leurs params
    // changent — cf. doc de la stratégie (citations oc-block: du panneau
    // assistant naviguant d'un éditeur de bloc à un autre).
    { provide: RouteReuseStrategy, useClass: RemountOnParamChangeStrategy },
    provideClientHydration(withEventReplay()),
    // withInterceptorsFromDi : l'intercepteur d'angular-oauth2-oidc (Bearer vers
    // l'API) est enregistré via le token legacy HTTP_INTERCEPTORS.
    provideHttpClient(withInterceptorsFromDi()),
    // Langages custom des fences markdown (```geogebra…), montés par markdown-view.
    provideMarkdownExtensions(),
    provideOAuthClient({
      resourceServer: {
        allowedUrls: [environment.apiUrl],
        sendAccessToken: true,
        // Les routes publiques élèves (/v1/public/*) sont anonymes par
        // contrat : un prof connecté qui ouvre un lien de partage ne doit pas
        // y fuiter son JWT Zitadel. customUrlValidation REMPLACE le check
        // allowedUrls quand il est présent — il réimplémente donc le préfixe.
        customUrlValidation: (url) =>
          url.toLowerCase().startsWith(environment.apiUrl.toLowerCase()) &&
          !url.includes('/v1/public/'),
      },
    }),
    {
      // La session prof survit au redémarrage du navigateur ; storage inerte au SSR.
      provide: OAuthStorage,
      useFactory: () =>
        isPlatformBrowser(inject(PLATFORM_ID)) ? localStorage : new MemoryStorage(),
    },
    provideTransloco({
      config: {
        availableLangs: ['fr', 'en'],
        defaultLang: 'fr',
        fallbackLang: 'fr',
        // Sans ce réglage, fallbackLang ne couvre pas les clés manquantes :
        // une clé absente d'en.json rendrait la clé brute.
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoImportLoader,
    }),
    // Active la langue issue de l'URL AVANT le premier rendu, sur serveur ET client :
    // le HTML prerendered/SSR sort dans la bonne langue (sinon chaînes vides), et le
    // premier rendu client correspond au DOM serveur (pas de NG0500 sur header/footer).
    // On lit PlatformLocation.pathname car REQUEST vaut null au prerender ; PlatformLocation
    // reflète INITIAL_CONFIG.url au serveur et location au navigateur.
    provideAppInitializer(() => {
      const transloco = inject(TranslocoService);
      const lang = langFromPath(inject(PlatformLocation).pathname);
      inject(LanguageService).activate(lang);
      return firstValueFrom(transloco.load(lang));
    }),
    // Câblage de la mesure d'audience. `AnalyticsService` n'injecte NI Router NI
    // AuthService — sinon toute spec d'un service `core/` instrumenté devrait
    // fournir OAuthService. Le raccord vit donc ici, dans un contexte
    // d'injection qui a déjà les deux.
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      const analytics = inject(AnalyticsService);
      const auth = inject(AuthService);
      const router = inject(Router);

      // La vue de page est capturée par posthog-js lui-même (history_change) :
      // cet abonnement ne sert qu'à couper le replay sur les pages élèves.
      router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe(() => analytics.trackNavigation(router.url));

      effect(() => {
        // Le `sub` OIDC seulement : ni email, ni nom, que les claims exposent pourtant.
        const sub = auth.identityClaims()?.['sub'];
        if (auth.isAuthenticated() && typeof sub === 'string') {
          analytics.identify(sub);
        } else {
          analytics.reset();
        }
      });
    }),
  ],
};
