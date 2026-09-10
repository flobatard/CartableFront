import {
  afterNextRender,
  computed,
  inject,
  Injectable,
  Injector,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { environment } from '../../../environments/environment';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  ConsentChoice,
  ConsentDecision,
  parseDecision,
} from './consent.model';

/**
 * Consentement de l'utilisateur au dépôt et à l'envoi de données de mesure.
 * Indépendant de PostHog : c'est `AnalyticsService` qui l'observe.
 *
 * Opt-in strict — tant qu'aucune décision n'est enregistrée, `analyticsGranted()`
 * est faux et rien n'est chargé.
 *
 * N'injecte QUE `PLATFORM_ID` : les services `core/` instrumentés (et leurs
 * specs) doivent pouvoir en dépendre sans provider supplémentaire.
 *
 * Le storage est lu APRÈS hydratation (`afterNextRender`) : la home est
 * prerendue et le catch-all est rendu au serveur, un rendu client divergent
 * lèverait NG0500. Avant résolution, `needsBanner()` est faux — donc rien dans
 * le HTML serveur, rien au premier rendu client, la bannière apparaît juste après.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #injector = inject(Injector);

  /** `null` = aucun choix exploitable (jamais donné, périmé ou d'une autre version). */
  readonly #decision = signal<ConsentDecision | null>(null);
  readonly decision = this.#decision.asReadonly();

  /** Faux tant que le storage n'a pas été lu (serveur, et avant hydratation). */
  readonly #resolved = signal(false);
  readonly resolved = this.#resolved.asReadonly();

  readonly #preferencesOpen = signal(false);
  /** Piloté par le pied de page et la page de confidentialité. */
  readonly preferencesOpen = this.#preferencesOpen.asReadonly();

  /**
   * Storage utilisable, sondé une fois. `null` en SSR, en navigation privée, ou
   * quand le navigateur expose l'objet mais rejette l'écriture — auquel cas on
   * ne mesure pas du tout : sans trace du choix, on ne peut pas le respecter.
   */
  readonly #storage = signal<Storage | null>(null);

  /** L'environnement autorise-t-il la mesure, et la clé est-elle renseignée ? */
  readonly configured =
    environment.analytics.enabled && environment.analytics.posthogKey.trim() !== '';

  /** L'environnement propose-t-il l'enregistrement de session ? */
  readonly replayOffered = this.configured && environment.analytics.sessionReplay;

  readonly analyticsGranted = computed(() => this.configured && this.#decision()?.analytics === true);

  readonly sessionReplayGranted = computed(
    () => this.replayOffered && this.#decision()?.sessionReplay === true,
  );

  /** Bannière à afficher : mesure autorisée, storage disponible, aucun choix en cours. */
  readonly needsBanner = computed(
    () => this.configured && this.#resolved() && this.#storage() !== null && this.#decision() === null,
  );

  constructor() {
    if (!this.#isBrowser || !this.configured) {
      return;
    }
    afterNextRender(() => this.#restore(), { injector: this.#injector });
  }

  acceptAll(): void {
    this.save({ analytics: true, sessionReplay: this.replayOffered });
  }

  rejectAll(): void {
    this.save({ analytics: false, sessionReplay: false });
  }

  /** Enregistre un choix explicite et ferme la modale s'il vient d'elle. */
  save(choice: ConsentChoice): void {
    const decision: ConsentDecision = {
      version: CONSENT_VERSION,
      analytics: choice.analytics,
      // Un replay sans mesure n'a pas de sens, et il n'est pas proposé partout.
      sessionReplay: choice.analytics && this.replayOffered && choice.sessionReplay,
      date: new Date().toISOString(),
    };
    this.#decision.set(decision);
    this.#preferencesOpen.set(false);
    const storage = this.#storage();
    try {
      storage?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(decision));
    } catch {
      // Écriture refusée après la sonde : le choix vaut pour la session courante.
    }
  }

  openPreferences(): void {
    this.#preferencesOpen.set(true);
  }

  closePreferences(): void {
    this.#preferencesOpen.set(false);
  }

  #restore(): void {
    const storage = probeStorage();
    this.#storage.set(storage);
    if (storage) {
      let raw: string | null = null;
      try {
        raw = storage.getItem(CONSENT_STORAGE_KEY);
      } catch {
        raw = null;
      }
      this.#decision.set(parseDecision(raw, new Date()));
    }
    this.#resolved.set(true);
  }
}

/**
 * `localStorage` s'il est réellement utilisable, sinon `null` (SSR, navigation
 * privée, site data bloqué). Même sonde que `answerStorage()` de
 * `core/student/answer-storage.ts` : certains navigateurs exposent l'objet mais
 * rejettent toute écriture.
 */
function probeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const probe = `${CONSENT_STORAGE_KEY}.__probe__`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
