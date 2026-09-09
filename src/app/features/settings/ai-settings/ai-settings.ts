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
  EMPTY_FORM_VALUE,
  filterModels,
  isFormComplete,
  modelListingSupported,
  modelListPayloadFromForm,
  patchFormFromConfiguration,
  payloadFromConfiguration,
  payloadFromForm,
  testPayloadFromForm,
} from '../../../core/ai-credentials/ai-credentials-form';
import {
  AI_CONFIGURATION_NAME_MAX_LENGTH,
  AI_CONFIGURATIONS_MAX,
  AI_PROVIDERS,
  AiConfiguration,
  EMPTY_REASONING_OPTIONS,
  KNOWN_REASONING_EFFORTS,
  ReasoningOptions,
} from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { armedAction } from '../../../core/editing/armed';

/** Ids DOM uniques par instance (datalist des modèles) — jamais Date.now(). */
let nextId = 0;

/** Éditeur ouvert : `id: null` = création, sinon la configuration éditée. */
interface EditorTarget {
  id: string | null;
}

/**
 * Réglages de l'assistant IA (sous-page du hub « Paramètres ») : liste de
 * radios-cartes — l'IA par défaut de la plateforme (fallback serveur, quota
 * quotidien affiché « utilisés / autorisés », 0 = illimité) et chaque
 * configuration nommée de l'utilisateur (provider · modèle) — dont la radio
 * cochée est la configuration ACTIVE côté serveur. Cocher une carte bascule
 * AUSSITÔT (PUT `/active`), sans bouton d'enregistrement ; aucune active =
 * IA par défaut. Les configurations sont conservées quand on revient à l'IA
 * par défaut.
 *
 * L'éditeur (création par « Nouvelle configuration », modification par la
 * carte) porte le formulaire : provider, clé API (chiffrée côté serveur,
 * jamais ré-affichée), base_url pour ollama/openai_compatible, modèle, nom,
 * préférences de raisonnement. Créer ACTIVE la configuration (le back) et
 * referme l'éditeur ; modifier ne change pas le statut actif.
 *
 * Contrat clé API : le champ est TOUJOURS vide à l'affichage ; quand une clé
 * est déjà enregistrée, le laisser vide la conserve (le payload omet
 * `api_key`) — le placeholder l'explique. « Enregistrer » n'est actif que si
 * le formulaire est complet ET modifié (snapshot JSON, comme la page profil).
 *
 * Préférences de raisonnement (raisonnement forcé/coupé, niveau d'effort
 * natif) : deux `<select>` après le modèle dont les options viennent du
 * catalogue back pour le couple (provider, modèle) — reçues avec la
 * configuration, re-sondées (POST `/reasoning-options`) au changement de
 * provider, au blur du champ modèle et au choix d'une suggestion ; une valeur
 * que le nouveau modèle ne propose plus repasse à « par défaut ». Enregistrées
 * avec le reste du formulaire. Le pied du chat les enregistre aussi, aussitôt,
 * sur la configuration active : un éditeur ouvert sur elle et non modifié se
 * réaligne sur le signal.
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
  protected readonly nameMaxLength = AI_CONFIGURATION_NAME_MAX_LENGTH;
  protected readonly configurationsMax = AI_CONFIGURATIONS_MAX;

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
  /** Suppression en deux temps, par id de configuration. */
  protected readonly deleteArmed = armedAction<string>();
  /** Bascule (PUT /active) en cours : les radios sont gelées. */
  protected readonly switching = signal(false);
  /** Messages de la liste (bascule, suppression, création) — clés i18n. */
  protected readonly listErrorKey = signal<string | null>(null);
  protected readonly listSuccessKey = signal<string | null>(null);
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

  /** Éditeur ouvert (`null` = liste seule). */
  protected readonly editor = signal<EditorTarget | null>(null);
  protected readonly creating = computed(() => this.editor()?.id === null);

  protected readonly configurations = computed(
    () => this.#credentials.credentials()?.configurations ?? [],
  );
  protected readonly activeId = computed(
    () => this.#credentials.credentials()?.active_id ?? null,
  );
  /** La configuration éditée telle qu'enregistrée (`null` en création ou sans éditeur). */
  protected readonly editedConfig = computed(() => {
    const target = this.editor();
    if (!target || target.id === null) {
      return null;
    }
    return this.configurations().find((c) => c.id === target.id) ?? null;
  });
  protected readonly apiKeySet = computed(() => this.editedConfig()?.api_key_set ?? false);
  protected readonly canCreate = computed(
    () => this.configurations().length < AI_CONFIGURATIONS_MAX,
  );

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
  protected readonly filteredModels = computed(() =>
    filterModels(this.modelOptions() ?? [], this.#formValue().model ?? ''),
  );

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
    // Deux écrivains de la même configuration : le pied du chat enregistre
    // les préférences de raisonnement de l'ACTIVE aussitôt, et le panneau
    // assistant survit aux navigations (visible sur cette page). Un éditeur
    // ouvert sur une configuration enregistrée et NON modifié se réaligne sur
    // le signal ; une saisie en cours n'est jamais écrasée ; une configuration
    // supprimée ailleurs referme l'éditeur. `untracked` : la relecture du
    // formulaire ne doit pas re-déclencher l'effect, et l'égalité des
    // snapshots évite un re-patch (donc un `valueChanges`, qui effacerait
    // « Réglages enregistrés ») juste après notre propre sauvegarde.
    effect(() => {
      const creds = this.#credentials.credentials();
      untracked(() => {
        const target = this.editor();
        if (!creds || !target || target.id === null || this.loading()) {
          return;
        }
        const config = creds.configurations.find((c) => c.id === target.id);
        if (!config) {
          this.closeEditor();
          return;
        }
        if (this.dirty()) {
          return;
        }
        if (JSON.stringify(payloadFromConfiguration(config)) === this.#savedPayload()) {
          return;
        }
        patchFormFromConfiguration(this.form, config);
        this.#applyReasoningOptions(config.reasoning_options);
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
      // Rien de configuré et pas d'IA par défaut : l'éditeur s'ouvre de
      // lui-même, il n'y a rien d'autre à faire ici.
      if (creds.configurations.length === 0 && !creds.default_ai_available) {
        this.openEditor(null);
      }
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Radio cochée : bascule immédiate (`null` = IA par défaut) ; rien si déjà active. */
  protected async select(id: string | null): Promise<void> {
    if (id === this.activeId() || this.switching()) {
      return;
    }
    this.switching.set(true);
    this.deleteArmed.disarm();
    this.listErrorKey.set(null);
    this.listSuccessKey.set(null);
    try {
      await this.#credentials.activate(id);
    } catch (error) {
      this.listErrorKey.set(this.#switchErrorKey(error));
    } finally {
      this.switching.set(false);
    }
  }

  /** Ouvre l'éditeur : vide (création) ou pré-rempli (modification). */
  protected openEditor(config: AiConfiguration | null): void {
    this.editor.set({ id: config?.id ?? null });
    this.deleteArmed.disarm();
    this.listErrorKey.set(null);
    this.listSuccessKey.set(null);
    this.saveErrorKey.set(null);
    if (config) {
      patchFormFromConfiguration(this.form, config);
      this.#applyReasoningOptions(config.reasoning_options);
    } else {
      this.form.reset({ ...EMPTY_FORM_VALUE });
      this.#applyReasoningOptions(EMPTY_REASONING_OPTIONS);
    }
    this.#savedPayload.set(JSON.stringify(payloadFromForm(this.form)));
    this.modelOptions.set(null);
    this.modelsErrorKey.set(null);
    this.saveSuccess.set(false);
    this.testSuccess.set(false);
    this.testErrorKey.set(null);
  }

  protected closeEditor(): void {
    this.editor.set(null);
    this.saveErrorKey.set(null);
    this.deleteArmed.disarm();
  }

  /** Création (le back active la nouvelle configuration, l'éditeur se referme) ou modification. */
  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const target = this.editor();
    if (!target) {
      return;
    }
    this.saving.set(true);
    this.saveErrorKey.set(null);
    try {
      if (target.id === null) {
        await this.#credentials.create(payloadFromForm(this.form));
        this.closeEditor();
        this.listSuccessKey.set('settings.ai.configurations.created');
        return;
      }
      await this.#credentials.update(target.id, payloadFromForm(this.form));
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
   * Teste la config affichée par un mini-appel provider côté serveur — mêmes
   * champs que l'écriture (champ clé vide = tester avec la clé enregistrée de
   * la configuration éditée), sans rien persister. Erreurs par statut : 400
   * clé refusée, 422 modèle/params, 429 quota provider, 503 injoignable.
   */
  protected async testConnection(): Promise<void> {
    if (!this.canTest()) {
      return;
    }
    this.testing.set(true);
    this.testSuccess.set(false);
    this.testErrorKey.set(null);
    try {
      await this.#credentials.testConnection(
        testPayloadFromForm(this.form, this.editor()?.id ?? null),
      );
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
        await this.#credentials.listModels(
          modelListPayloadFromForm(this.form, this.editor()?.id ?? null),
        ),
      );
    } catch (error) {
      this.modelsErrorKey.set(this.#probeErrorKey(error));
      this.closeModels();
    } finally {
      this.modelsLoading.set(false);
    }
  }

  /**
   * Suppression en deux temps sans modale (armée par id, désarmée au blur).
   * Supprimer l'active ramène à l'IA par défaut (le service relit le serveur) ;
   * l'éditeur ouvert sur la configuration supprimée se referme.
   */
  protected async removeConfig(id: string): Promise<void> {
    if (!this.deleteArmed.confirm(id)) {
      return;
    }
    this.deleting.set(true);
    this.listErrorKey.set(null);
    this.listSuccessKey.set(null);
    this.saveErrorKey.set(null);
    try {
      await this.#credentials.remove(id);
      if (this.editor()?.id === id) {
        this.closeEditor();
      }
      this.listSuccessKey.set('settings.ai.deleted');
    } catch (error) {
      this.listErrorKey.set(this.#errorKey(error));
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

  #switchErrorKey(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    return status === 404
      ? 'settings.ai.errors.invalid'
      : 'settings.ai.configurations.switchError';
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
