import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { merge } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  alignReasoningWithOptions,
  baseUrlRequired,
  baseUrlVisible,
  buildAiCredentialsForm,
  canListModels,
  isFormComplete,
  modelListingSupported,
  modelListPayloadFromForm,
  patchFormFromCredentials,
  payloadFromCredentials,
  payloadFromForm,
} from '../../../core/ai-credentials/ai-credentials-form';
import {
  AI_PROVIDERS,
  EMPTY_REASONING_OPTIONS,
  KNOWN_REASONING_EFFORTS,
  ReasoningOptions,
} from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { armedAction } from '../../../core/editing/armed';

/** Ids DOM uniques par instance (datalist des modèles) — jamais Date.now(). */
let nextId = 0;

/**
 * Réglages de l'assistant IA (sous-page du hub « Paramètres ») : choix
 * DÉLIBÉRÉ entre l'IA par défaut de la plateforme (fallback serveur, quota
 * quotidien affiché « utilisés / autorisés », 0 = illimité) et sa propre
 * config — provider, modèle, clé API (chiffrée côté serveur, jamais
 * ré-affichée), base_url pour ollama/openai_compatible.
 *
 * Le mode est DÉRIVÉ du serveur (config enregistrée = « ma clé », sinon
 * « IA par défaut ») ; les radios ne changent que la vue — revenir à l'IA
 * par défaut passe par le bouton en deux temps qui SUPPRIME la config
 * (même `removeConfig` que le bouton Supprimer du formulaire).
 *
 * Contrat clé API : le champ est TOUJOURS vide à l'affichage ; quand une clé
 * est déjà enregistrée, le laisser vide la conserve (le payload omet
 * `api_key`) — le placeholder l'explique. « Enregistrer » n'est actif que si
 * le formulaire est complet ET modifié (snapshot JSON, comme la page profil).
 *
 * Préférences de raisonnement (raisonnement forcé/coupé, niveau d'effort
 * natif) : deux `<select>` après le modèle dont les options viennent du
 * catalogue back pour le couple (provider, modèle) — reçues avec le credential
 * au chargement, re-sondées (POST `/reasoning-options`) au changement de
 * provider, au blur du champ modèle et au choix d'une suggestion ; une valeur
 * que le nouveau modèle ne propose plus repasse à « par défaut ». Enregistrées
 * avec le reste du formulaire. Le pied du chat les enregistre aussi, aussitôt :
 * un formulaire non modifié se réaligne sur le signal.
 */
@Component({
  selector: 'app-ai-settings',
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './ai-settings.html',
  styleUrl: './ai-settings.scss',
})
export class AiSettings implements OnInit {
  /**
   * Mode encastré (modale « Réglages IA » du panneau assistant) : le chrome
   * de la page (titre + intro) est masqué, la modale hôte porte le sien.
   */
  readonly embedded = input(false);

  readonly #credentials = inject(AiCredentialsService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly providers = AI_PROVIDERS;

  /** Public : les specs jsdom pilotent les contrôles (convention du repo). */
  readonly form = buildAiCredentialsForm();

  /** Miroir signal du formulaire (réactivité zoneless des computed/template). */
  readonly #formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveSuccess = signal(false);
  /** Clé i18n de l'erreur de sauvegarde (`null` = pas d'erreur). */
  protected readonly saveErrorKey = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteArmed = armedAction();
  protected readonly deleteSuccess = signal(false);
  protected readonly testing = signal(false);
  protected readonly testSuccess = signal(false);
  /** Clé i18n de l'erreur du test de connexion (`null` = pas d'erreur). */
  protected readonly testErrorKey = signal<string | null>(null);
  protected readonly modelsLoading = signal(false);
  protected readonly modelsErrorKey = signal<string | null>(null);
  /** Suggestions de modèles ; `null` = jamais chargées pour cette config. */
  protected readonly modelOptions = signal<string[] | null>(null);
  /** Listbox du combobox modèle ouverte (focus dans le champ). */
  protected readonly modelsOpen = signal(false);
  /** Option surlignée au clavier (-1 = aucune). */
  protected readonly activeIndex = signal(-1);

  protected readonly modelsListId = `ai-settings-models-${nextId++}`;

  /** Snapshot JSON du dernier payload persisté (chargé ou sauvegardé). */
  readonly #savedPayload = signal<string | null>(null);

  protected readonly apiKeySet = computed(
    () => this.#credentials.credentials()?.api_key_set ?? false,
  );

  /** Une configuration existe côté serveur (le bouton Supprimer a un objet). */
  protected readonly hasStoredConfig = computed(
    () => this.#credentials.credentials()?.provider != null,
  );

  /** Mode affiché — posé au chargement depuis l'état serveur, puis par les radios. */
  protected readonly mode = signal<'default' | 'custom'>('custom');

  protected readonly defaultAvailable = computed(
    () => this.#credentials.credentials()?.default_ai_available ?? false,
  );
  protected readonly quotaTotal = computed(
    () => this.#credentials.credentials()?.daily_quota ?? 0,
  );
  protected readonly quotaUsed = computed(
    () => this.#credentials.credentials()?.calls_today ?? 0,
  );
  /** Quota quotidien 0 = illimité (contrat back). */
  protected readonly quotaUnlimited = computed(() => this.quotaTotal() === 0);

  protected readonly providerValue = computed(() => this.#formValue().provider ?? null);
  protected readonly showBaseUrl = computed(() => baseUrlVisible(this.providerValue()));
  protected readonly baseUrlIsRequired = computed(() => baseUrlRequired(this.providerValue()));
  /** Options de raisonnement du couple (provider, modèle) affiché — catalogue back. */
  protected readonly reasoningOptions = signal<ReasoningOptions>(EMPTY_REASONING_OPTIONS);
  protected readonly showReasoningToggle = computed(
    () => this.reasoningOptions().toggle.length > 0,
  );
  protected readonly showReasoningEffort = computed(
    () => this.reasoningOptions().efforts.length > 0,
  );
  /** Numéro de la dernière sonde du catalogue (une réponse périmée est ignorée). */
  #optionsRequest = 0;

  protected readonly modelsSupported = computed(() => modelListingSupported(this.providerValue()));
  /** La config suffit pour interroger le provider (clé/base_url en place). */
  protected readonly modelsConfigReady = computed(() =>
    canListModels(this.#formValue(), this.apiKeySet()),
  );

  /** Suggestions filtrées par la saisie (champ vide = toutes). */
  protected readonly filteredModels = computed(() => {
    const options = this.modelOptions() ?? [];
    const query = (this.#formValue().model ?? '').trim().toLowerCase();
    return query ? options.filter((model) => model.toLowerCase().includes(query)) : options;
  });

  protected readonly activeOptionId = computed(() =>
    this.modelsOpen() && this.activeIndex() >= 0
      ? `${this.modelsListId}-${this.activeIndex()}`
      : null,
  );
  protected readonly canTest = computed(
    () =>
      !this.testing() &&
      !this.saving() &&
      !this.deleting() &&
      isFormComplete(this.#formValue(), this.apiKeySet()),
  );

  protected readonly dirty = computed(() => {
    this.#formValue(); // dépendance : réévalué à chaque modification du formulaire
    return JSON.stringify(payloadFromForm(this.form)) !== this.#savedPayload();
  });

  protected readonly canSave = computed(
    () =>
      this.dirty() &&
      !this.saving() &&
      !this.deleting() &&
      isFormComplete(this.#formValue(), this.apiKeySet()),
  );

  constructor() {
    // Toute modification efface les messages de l'action précédente — un test
    // de connexion réussi ne vaut plus rien pour une config modifiée.
    this.form.valueChanges.subscribe(() => {
      this.saveSuccess.set(false);
      this.deleteSuccess.set(false);
      this.testSuccess.set(false);
      this.testErrorKey.set(null);
    });
    // Les suggestions de modèles appartiennent à UNE config (provider + clé +
    // base_url) : modifier l'un des trois les purge — le prochain focus du
    // champ modèle re-sondera le provider avec la config corrigée.
    merge(
      this.form.controls.provider.valueChanges,
      this.form.controls.apiKey.valueChanges,
      this.form.controls.baseUrl.valueChanges,
    ).subscribe(() => {
      this.modelOptions.set(null);
      this.modelsErrorKey.set(null);
      this.closeModels();
    });
    // La frappe dans le champ modèle refiltre : le surlignage clavier repart.
    this.form.controls.model.valueChanges.subscribe(() => this.activeIndex.set(-1));
    // Les options de raisonnement dépendent du couple (provider, modèle) :
    // re-sonde au changement de provider (le modèle est re-sondé au blur).
    this.form.controls.provider.valueChanges.subscribe(() => {
      void this.refreshReasoningOptions();
    });
    // Deux écrivains du même credential : le pied du chat enregistre les
    // préférences de raisonnement aussitôt, et le panneau assistant survit
    // aux navigations (visible sur cette page). Un formulaire chargé et NON
    // modifié se réaligne sur le signal ; une saisie en cours n'est jamais
    // écrasée. `untracked` : la relecture du formulaire ne doit pas
    // re-déclencher l'effect, et l'égalité des snapshots évite un re-patch
    // (donc un `valueChanges`, qui effacerait « Réglages enregistrés ») juste
    // après notre propre sauvegarde.
    effect(() => {
      const creds = this.#credentials.credentials();
      untracked(() => {
        const payload = creds && payloadFromCredentials(creds);
        if (!creds || payload === null || this.loading() || this.dirty()) {
          return;
        }
        if (JSON.stringify(payload) === this.#savedPayload()) {
          return;
        }
        patchFormFromCredentials(this.form, creds);
        this.#applyReasoningOptions(creds.reasoning_options);
        this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
      });
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.#isBrowser) {
      return;
    }
    await this.loadCredentials();
  }

  protected async loadCredentials(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const creds = await this.#credentials.ensureLoaded();
      patchFormFromCredentials(this.form, creds);
      this.#applyReasoningOptions(creds.reasoning_options);
      this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
      this.mode.set(creds.provider ? 'custom' : 'default');
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.saveErrorKey.set(null);
    try {
      await this.#credentials.save(payloadFromForm(this.form));
      // La clé vient d'être enregistrée (chiffrée) : le champ redevient vide,
      // le placeholder « clé enregistrée » prend le relais.
      this.form.controls.apiKey.setValue('');
      this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
      this.saveSuccess.set(true);
    } catch (error) {
      this.saveErrorKey.set(this.#errorKey(error));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Teste la config affichée par un mini-appel provider côté serveur — même
   * corps que le PUT (champ clé vide = tester avec la clé enregistrée), sans
   * rien persister. Erreurs par statut : 400 clé refusée, 422 modèle/params,
   * 429 quota provider, 503 injoignable.
   */
  protected async testConnection(): Promise<void> {
    if (!this.canTest()) {
      return;
    }
    this.testing.set(true);
    this.testSuccess.set(false);
    this.testErrorKey.set(null);
    try {
      await this.#credentials.testConnection(payloadFromForm(this.form));
      this.testSuccess.set(true);
    } catch (error) {
      this.testErrorKey.set(this.#probeErrorKey(error));
    } finally {
      this.testing.set(false);
    }
  }

  /**
   * Ouvre la listbox du combobox modèle (focus ou frappe) et déclenche le
   * chargement des suggestions au premier passage. Rien ne s'ouvre tant que la
   * config ne permet pas d'interroger le provider (le hint sous le champ
   * l'explique) — le champ reste alors un input texte ordinaire.
   */
  protected openModels(): void {
    if (!this.modelsSupported() || !this.modelsConfigReady()) {
      return;
    }
    this.modelsOpen.set(true);
    void this.#ensureModelsLoaded();
  }

  protected closeModels(): void {
    this.modelsOpen.set(false);
    this.activeIndex.set(-1);
  }

  /** Choix d'une suggestion — remplit le champ, referme la listbox, re-sonde le catalogue. */
  protected pickModel(model: string): void {
    this.form.controls.model.setValue(model);
    this.closeModels();
    void this.refreshReasoningOptions();
  }

  /** Blur du champ modèle : referme la listbox et re-sonde le catalogue pour le couple saisi. */
  protected onModelBlur(): void {
    this.closeModels();
    void this.refreshReasoningOptions();
  }

  /** Un niveau connu de l'UI a un libellé i18n ; un autre s'affiche tel quel. */
  protected isKnownEffort(effort: string): boolean {
    return (KNOWN_REASONING_EFFORTS as readonly string[]).includes(effort);
  }

  /**
   * Sonde le catalogue back pour le couple (provider, modèle) saisi — rien
   * sans provider ou sans modèle (aucune option) ; une réponse périmée
   * (nouvelle sonde partie entre-temps) est ignorée ; un échec réseau laisse
   * les options en place (la prochaine sonde corrigera).
   */
  protected async refreshReasoningOptions(): Promise<void> {
    const request = ++this.#optionsRequest;
    const { provider, model } = this.form.getRawValue();
    const trimmed = model.trim();
    if (provider === null || !trimmed) {
      this.#applyReasoningOptions(EMPTY_REASONING_OPTIONS);
      return;
    }
    try {
      const options = await this.#credentials.reasoningOptions({ provider, model: trimmed });
      if (request === this.#optionsRequest) {
        this.#applyReasoningOptions(options);
      }
    } catch {
      // Options inchangées : le catalogue n'est qu'une aide à la saisie.
    }
  }

  /** Pose les options et ramène les préférences hors options à « par défaut ». */
  #applyReasoningOptions(options: ReasoningOptions): void {
    this.reasoningOptions.set(options);
    alignReasoningWithOptions(this.form, options);
  }

  protected onModelKeydown(event: KeyboardEvent): void {
    if (!this.modelsSupported()) {
      return;
    }
    const options = this.filteredModels();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.modelsOpen()) {
        this.openModels();
      } else if (options.length > 0) {
        this.activeIndex.set((this.activeIndex() + 1) % options.length);
      }
    } else if (event.key === 'ArrowUp') {
      if (this.modelsOpen() && options.length > 0) {
        event.preventDefault();
        this.activeIndex.set((this.activeIndex() - 1 + options.length) % options.length);
      }
    } else if (event.key === 'Enter') {
      const active = this.modelsOpen() ? options[this.activeIndex()] : undefined;
      if (active !== undefined) {
        event.preventDefault();
        this.pickModel(active);
      }
    } else if (event.key === 'Escape' && this.modelsOpen()) {
      event.preventDefault();
      this.closeModels();
    }
  }

  /** Sonde le provider une seule fois par config (purge = re-sonde possible). */
  async #ensureModelsLoaded(): Promise<void> {
    if (this.modelOptions() !== null || this.modelsLoading() || this.modelsErrorKey() !== null) {
      return;
    }
    this.modelsLoading.set(true);
    try {
      this.modelOptions.set(
        await this.#credentials.listModels(modelListPayloadFromForm(this.form)),
      );
    } catch (error) {
      this.modelsErrorKey.set(this.#probeErrorKey(error));
      this.closeModels();
    } finally {
      this.modelsLoading.set(false);
    }
  }

  /** Bascule de vue par les radios ; efface les messages de l'action précédente. */
  protected selectMode(mode: 'default' | 'custom'): void {
    this.mode.set(mode);
    this.deleteArmed.disarm();
    this.saveSuccess.set(false);
    this.deleteSuccess.set(false);
    this.saveErrorKey.set(null);
  }

  /**
   * Suppression en deux temps sans modale, désarmée au blur. Sert aussi de « Utiliser l'IA par défaut » : sans config
   * enregistrée, l'IA par défaut s'applique — la vue reste donc sur ce mode.
   */
  protected async removeConfig(): Promise<void> {
    if (!this.deleteArmed.confirm(true)) {
      return;
    }
    this.deleting.set(true);
    this.saveErrorKey.set(null);
    try {
      await this.#credentials.remove();
      this.form.reset({
        provider: null,
        model: '',
        apiKey: '',
        baseUrl: '',
        reasoning: null,
        reasoningEffort: null,
      });
      this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
      this.deleteSuccess.set(true);
      this.mode.set('default');
    } catch (error) {
      this.saveErrorKey.set(this.#errorKey(error));
    } finally {
      this.deleting.set(false);
    }
  }

  #errorKey(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 422) {
      return 'settings.ai.errors.invalid';
    }
    if (status === 503) {
      return 'settings.ai.errors.unavailable';
    }
    return 'settings.ai.errors.generic';
  }

  /** Erreurs des sondes provider (test de connexion, listing des modèles). */
  #probeErrorKey(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 400) {
      return 'settings.ai.probeErrors.badKey';
    }
    if (status === 422) {
      return 'settings.ai.probeErrors.invalid';
    }
    if (status === 429) {
      return 'settings.ai.probeErrors.rateLimited';
    }
    if (status === 503) {
      return 'settings.ai.probeErrors.unavailable';
    }
    return 'settings.ai.probeErrors.generic';
  }
}
