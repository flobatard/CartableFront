import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import {
  AI_CONFIGURATIONS_MAX,
  AiConfiguration,
  AiCredentials,
  AiProvider,
  EMPTY_REASONING_OPTIONS,
  ReasoningOptions,
} from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { AiSettings } from './ai-settings';

/** Options du catalogue back, par provider (le modèle saisi n'importe pas ici). */
const ALL_LEVELS: ReasoningOptions = { toggle: ['on', 'off'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], known: true };
const OPTIONS_BY_PROVIDER: Partial<Record<AiProvider, ReasoningOptions>> = {
  anthropic: ALL_LEVELS,
  openai: { toggle: [], efforts: ['low', 'medium', 'high'], known: false },
};

const CLAUDE_ID = '11111111-1111-4111-8111-111111111111';
const OLLAMA_ID = '22222222-2222-4222-8222-222222222222';

const CLAUDE: AiConfiguration = {
  id: CLAUDE_ID,
  name: 'Claude',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  base_url: null,
  api_key_set: true,
  reasoning: null,
  reasoning_effort: null,
  reasoning_options: ALL_LEVELS,
};

const OLLAMA: AiConfiguration = {
  id: OLLAMA_ID,
  name: 'Pi',
  provider: 'ollama',
  model: 'llama3.2',
  base_url: 'http://pi:11434',
  api_key_set: false,
  reasoning: null,
  reasoning_effort: null,
  reasoning_options: { toggle: ['on', 'off'], efforts: [], known: false },
};

const NO_CONFIG: AiCredentials = {
  configurations: [],
  active_id: null,
  default_ai_available: true,
  daily_quota: 30,
  calls_today: 12,
  default_provider: 'mistral',
  default_model: 'ministral-14b-latest',
};

/** Une configuration Claude active, plus Ollama inactive. */
const STORED: AiCredentials = {
  ...NO_CONFIG,
  configurations: [CLAUDE, OLLAMA],
  active_id: CLAUDE_ID,
};

describe('AiSettings', () => {
  let credentials: ReturnType<typeof signal<AiCredentials | null>>;
  let service: {
    credentials: ReturnType<typeof signal<AiCredentials | null>>;
    ensureLoaded: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
    testConnection: ReturnType<typeof vi.fn>;
    listModels: ReturnType<typeof vi.fn>;
    reasoningOptions: ReturnType<typeof vi.fn>;
  };

  function setup(initial: AiCredentials) {
    credentials = signal<AiCredentials | null>(initial);
    service = {
      credentials,
      ensureLoaded: vi.fn().mockResolvedValue(initial),
      create: vi.fn().mockResolvedValue(initial),
      update: vi.fn().mockResolvedValue(initial),
      remove: vi.fn().mockResolvedValue(undefined),
      activate: vi.fn().mockResolvedValue(initial),
      testConnection: vi.fn().mockResolvedValue(undefined),
      listModels: vi.fn().mockResolvedValue([]),
      reasoningOptions: vi.fn().mockImplementation(
        async ({ provider }: { provider: AiProvider }) =>
          OPTIONS_BY_PROVIDER[provider] ?? EMPTY_REASONING_OPTIONS,
      ),
    };
    TestBed.configureTestingModule({
      imports: [AiSettings, provideTranslocoTesting()],
      providers: [{ provide: AiCredentialsService, useValue: service }],
    });
    const fixture = TestBed.createComponent(AiSettings);
    return fixture;
  }

  function el(fixture: ComponentFixture<AiSettings>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Les radios de la liste : [0] IA par défaut, puis une par configuration. */
  function radios(fixture: ComponentFixture<AiSettings>): HTMLInputElement[] {
    return Array.from(el(fixture).querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  }

  /** Ouvre l'éditeur sur la carte d'index `index` (0 = première configuration). */
  async function openEdit(fixture: ComponentFixture<AiSettings>, index = 0) {
    await fixture.whenStable();
    fixture.detectChanges();
    el(fixture).querySelectorAll<HTMLButtonElement>('.ai-settings__edit')[index].click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openNew(fixture: ComponentFixture<AiSettings>) {
    await fixture.whenStable();
    fixture.detectChanges();
    el(fixture).querySelector<HTMLButtonElement>('.ai-settings__new')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // ------------------------------------------------------------- liste

  it('lists the default AI and each configuration, the active one checked, no form', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    fixture.detectChanges();

    const inputs = radios(fixture);
    expect(inputs).toHaveLength(3);
    expect(inputs.map((r) => r.checked)).toEqual([false, true, false]);
    const titles = Array.from(el(fixture).querySelectorAll('.ai-settings__mode-title'));
    expect(titles.map((t) => t.textContent!.trim())).toEqual([
      'IA par défaut de la plateforme',
      'Claude',
      'Pi',
    ]);
    expect(el(fixture).textContent).toContain('Anthropic (Claude) · claude-sonnet-5');
    expect(el(fixture).querySelector('.ai-settings__form')).toBeNull();
  });

  it('checking a card activates it at once; checking the default AI passes null', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    fixture.detectChanges();

    radios(fixture)[2].click();
    await fixture.whenStable();
    expect(service.activate).toHaveBeenCalledWith(OLLAMA_ID);

    radios(fixture)[0].click();
    await fixture.whenStable();
    expect(service.activate).toHaveBeenLastCalledWith(null);

    // Cocher l'active ne fait rien.
    radios(fixture)[1].click();
    await fixture.whenStable();
    expect(service.activate).toHaveBeenCalledTimes(2);
  });

  it('a failed switch shows an error in the list', async () => {
    const fixture = setup(STORED);
    service.activate.mockRejectedValue(new HttpErrorResponse({ status: 500 }));
    await fixture.whenStable();
    fixture.detectChanges();

    radios(fixture)[0].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Changement de configuration impossible');
  });

  it('without a configuration: the default AI is checked with the quota usage', async () => {
    const fixture = setup(NO_CONFIG);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(radios(fixture)).toHaveLength(1);
    expect(radios(fixture)[0].checked).toBe(true);
    expect(el(fixture).querySelector('.ai-settings__form')).toBeNull();
    const hint = el(fixture).querySelector('.ai-settings__mode-hint') as HTMLElement;
    expect(hint.textContent).toContain('12 / 30');
  });

  it('quota 0: unlimited messages, never “0 / 0”', async () => {
    const fixture = setup({ ...NO_CONFIG, daily_quota: 0, calls_today: 4 });
    await fixture.whenStable();
    fixture.detectChanges();

    const hint = el(fixture).querySelector('.ai-settings__mode-hint') as HTMLElement;
    expect(hint.textContent).not.toContain('/');
  });

  it('no configuration and no default AI: the editor opens by itself', async () => {
    const fixture = setup({ ...NO_CONFIG, default_ai_available: false });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(radios(fixture)[0].disabled).toBe(true);
    expect(el(fixture).querySelector('.ai-settings__form')).toBeTruthy();
    expect(el(fixture).textContent).toContain("ne propose pas d'IA par défaut");
  });

  it('deletes a card in two steps (armed then confirmed)', async () => {
    const fixture = setup(STORED);
    await fixture.whenStable();
    fixture.detectChanges();

    const deleteButton = el(fixture).querySelectorAll<HTMLButtonElement>('.ai-settings__delete')[1];
    deleteButton.click();
    await fixture.whenStable();
    expect(service.remove).not.toHaveBeenCalled();

    deleteButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.remove).toHaveBeenCalledWith(OLLAMA_ID);
    expect(el(fixture).textContent).toContain('Configuration supprimée');
  });

  it('the limit disables “new configuration” with a hint', async () => {
    const many = Array.from({ length: AI_CONFIGURATIONS_MAX }, (_, i) => ({
      ...CLAUDE,
      id: `${i}0000000-0000-4000-8000-000000000000`,
      name: `C${i}`,
    }));
    const fixture = setup({ ...NO_CONFIG, configurations: many, active_id: many[0].id });
    await fixture.whenStable();
    fixture.detectChanges();

    const newButton = el(fixture).querySelector<HTMLButtonElement>('.ai-settings__new')!;
    expect(newButton.disabled).toBe(true);
    expect(el(fixture).textContent).toContain(`maximum de ${AI_CONFIGURATIONS_MAX}`);
  });

  // ------------------------------------------------------------- création

  it('“new configuration” opens an empty editor; creating sends the name and closes it', async () => {
    const fixture = setup(STORED);
    await openNew(fixture);
    const component = fixture.componentInstance;

    expect(el(fixture).querySelector('.ai-settings__form')).toBeTruthy();
    expect(component.form.controls.provider.value).toBeNull();
    const saveButton = el(fixture).querySelector<HTMLButtonElement>('.ai-settings__save')!;
    expect(saveButton.disabled).toBe(true);
    expect(saveButton.textContent).toContain('Créer et utiliser');

    component.form.controls.provider.setValue('anthropic');
    component.form.controls.model.setValue('claude-opus-5');
    component.form.controls.apiKey.setValue('sk-x');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(saveButton.disabled).toBe(true); // nom requis
    component.form.controls.name.setValue('Opus');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(saveButton.disabled).toBe(false);

    saveButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.create).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-opus-5',
      base_url: null,
      reasoning: null,
      reasoning_effort: null,
      api_key: 'sk-x',
      name: 'Opus',
    });
    expect(el(fixture).querySelector('.ai-settings__form')).toBeNull();
    expect(el(fixture).textContent).toContain('Configuration créée');
  });

  it('cancel closes the editor without saving', async () => {
    const fixture = setup(STORED);
    await openNew(fixture);
    el(fixture).querySelector<HTMLButtonElement>('.ai-settings__cancel')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el(fixture).querySelector('.ai-settings__form')).toBeNull();
    expect(service.create).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------- édition

  it('edit prefills name/provider/model, never the key; the name field comes after the password', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);

    const component = fixture.componentInstance;
    expect(el(fixture).textContent).toContain('Modifier « Claude »');
    expect(component.form.controls.name.value).toBe('Claude');
    expect(component.form.controls.provider.value).toBe('anthropic');
    expect(component.form.controls.model.value).toBe('claude-sonnet-5');
    expect(component.form.controls.apiKey.value).toBe('');
    const inputs = Array.from(el(fixture).querySelectorAll<HTMLInputElement>('.ai-settings__form input'));
    const types = inputs.map((i) => i.type);
    // Parade Firefox : aucun champ texte AVANT le password.
    expect(types.indexOf('text')).toBeGreaterThan(types.indexOf('password'));
    expect(inputs.find((i) => i.type === 'password')!.value).toBe('');
  });

  it('stored key + empty field: the update payload OMITS api_key and targets the edited id', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);
    const component = fixture.componentInstance;

    component.form.controls.model.setValue('claude-opus-5');
    await fixture.whenStable();
    fixture.detectChanges();

    const saveButton = el(fixture).querySelector<HTMLButtonElement>('.ai-settings__save')!;
    expect(saveButton.disabled).toBe(false);
    saveButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.update).toHaveBeenCalledWith(CLAUDE_ID, {
      provider: 'anthropic',
      model: 'claude-opus-5',
      base_url: null,
      reasoning: null,
      reasoning_effort: null,
      name: 'Claude',
    });
    // L'éditeur reste ouvert après une modification.
    expect(el(fixture).querySelector('.ai-settings__form')).toBeTruthy();
    expect(el(fixture).textContent).toContain('Réglages enregistrés');
  });

  it('offers the reasoning controls from the catalogue options of the (provider, model) pair', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);
    const reasoningSelects = () =>
      el(fixture).querySelectorAll('.ai-settings__reasoning select').length;
    // Options reçues avec la configuration : aucune sonde à l'ouverture.
    expect(reasoningSelects()).toBe(2); // anthropic : bascule + effort
    expect(service.reasoningOptions).not.toHaveBeenCalled();
    const effortOptions = Array.from(
      el(fixture).querySelectorAll('.ai-settings__reasoning select'),
    )[1] as HTMLSelectElement;
    expect(Array.from(effortOptions.options, (o) => o.textContent!.trim())).toEqual([
      'Par défaut',
      'Faible',
      'Moyen',
      'Élevé',
      'Très élevé',
      'Maximum',
    ]);

    const component = fixture.componentInstance;
    component.form.controls.provider.setValue('openai');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.reasoningOptions).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'claude-sonnet-5',
    });
    expect(reasoningSelects()).toBe(1); // effort seul
    expect(el(fixture).textContent).toContain('Modèle non reconnu'); // known: false

    component.form.controls.provider.setValue('mistral');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(reasoningSelects()).toBe(0);
    expect(el(fixture).querySelector('.ai-settings__reasoning-hint')).toBeNull();
  });

  it('model blur re-probes the catalogue and drops a level the new model does not offer', async () => {
    const fixture = setup(STORED);
    service.reasoningOptions.mockResolvedValue({
      toggle: ['on', 'off'],
      efforts: ['low', 'medium', 'high'],
      known: true,
    });
    await openEdit(fixture);
    const component = fixture.componentInstance;
    component.form.controls.reasoningEffort.setValue('max');
    component.form.controls.model.setValue('claude-opus-4-5');
    await fixture.whenStable();

    const modelInput = el(fixture).querySelector('input[role="combobox"]') as HTMLInputElement;
    modelInput.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.reasoningOptions).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-opus-4-5',
    });
    expect(component.form.controls.reasoningEffort.value).toBeNull(); // « max » non proposé
    const efforts = Array.from(
      el(fixture).querySelectorAll('.ai-settings__reasoning select'),
    )[1] as HTMLSelectElement;
    expect(efforts.options.length).toBe(4); // défaut + low/medium/high
  });

  it('saves the reasoning preferences with the configuration, nulled when the provider drops them', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);
    const component = fixture.componentInstance;

    component.form.controls.reasoning.setValue(true);
    component.form.controls.reasoningEffort.setValue('xhigh'); // niveau natif Anthropic
    await fixture.whenStable();
    fixture.detectChanges();
    const saveButton = el(fixture).querySelector<HTMLButtonElement>('.ai-settings__save')!;
    expect(saveButton.disabled).toBe(false); // les préférences comptent comme une modification
    saveButton.click();
    await fixture.whenStable();
    expect(service.update).toHaveBeenLastCalledWith(CLAUDE_ID, {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      base_url: null,
      reasoning: true,
      reasoning_effort: 'xhigh',
      name: 'Claude',
    });

    component.form.controls.provider.setValue('mistral');
    await fixture.whenStable();
    fixture.detectChanges();
    saveButton.click();
    await fixture.whenStable();
    expect(service.update).toHaveBeenLastCalledWith(
      CLAUDE_ID,
      expect.objectContaining({ provider: 'mistral', reasoning: null, reasoning_effort: null }),
    );
  });

  it('re-aligns an untouched editor when the edited configuration changes elsewhere (chat footer)', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);
    const component = fixture.componentInstance;

    const patched = { ...CLAUDE, reasoning: false, reasoning_effort: 'low' };
    credentials.set({ ...STORED, configurations: [patched, OLLAMA] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.form.controls.reasoning.value).toBe(false);
    expect(component.form.controls.reasoningEffort.value).toBe('low');
    // Réaligné = pas une modification : rien à enregistrer.
    const saveButton = el(fixture).querySelector<HTMLButtonElement>('.ai-settings__save')!;
    expect(saveButton.disabled).toBe(true);

    // Une saisie en cours n'est jamais écrasée.
    component.form.controls.model.setValue('claude-opus-5');
    await fixture.whenStable();
    credentials.set({
      ...STORED,
      configurations: [{ ...CLAUDE, reasoning: true, reasoning_effort: 'high' }, OLLAMA],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.form.controls.model.value).toBe('claude-opus-5');
    expect(component.form.controls.reasoning.value).toBe(false);
  });

  it('closes the editor when the edited configuration disappears from the server state', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);
    credentials.set({ ...STORED, configurations: [OLLAMA], active_id: null });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el(fixture).querySelector('.ai-settings__form')).toBeNull();
  });

  it('key typed: the payload carries it, then the field is cleared after save', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);
    const component = fixture.componentInstance;

    component.form.controls.apiKey.setValue('sk-nouvelle');
    await fixture.whenStable();
    fixture.detectChanges();
    el(fixture).querySelector<HTMLButtonElement>('.ai-settings__save')!.click();
    await fixture.whenStable();

    expect(service.update).toHaveBeenCalledWith(
      CLAUDE_ID,
      expect.objectContaining({ api_key: 'sk-nouvelle' }),
    );
    expect(component.form.controls.apiKey.value).toBe('');
  });

  it('shows base_url for ollama only', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);
    expect(el(fixture).querySelector('input[type="url"]')).toBeNull();

    fixture.componentInstance.form.controls.provider.setValue('ollama');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el(fixture).querySelector('input[type="url"]')).toBeTruthy();
  });

  it('deleting the edited configuration from its card closes the editor', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);

    const deleteButton = el(fixture).querySelector<HTMLButtonElement>('.ai-settings__delete')!;
    deleteButton.click();
    await fixture.whenStable();
    expect(service.remove).not.toHaveBeenCalled();

    deleteButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.remove).toHaveBeenCalledWith(CLAUDE_ID);
    expect(el(fixture).querySelector('.ai-settings__form')).toBeNull();
  });

  // ------------------------------------------------------------- sondes

  it('test connection sends the fields with config_id (empty key field = stored key), no name', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);

    const testButton = el(fixture).querySelector<HTMLButtonElement>('.ai-settings__test')!;
    expect(testButton.disabled).toBe(false);
    testButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.testConnection).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      base_url: null,
      reasoning: null,
      reasoning_effort: null,
      config_id: CLAUDE_ID,
    });
    expect(el(fixture).textContent).toContain('Connexion réussie');
  });

  it('test connection failure maps the status to a probe error message', async () => {
    const fixture = setup(STORED);
    service.testConnection.mockRejectedValue(new HttpErrorResponse({ status: 400 }));
    await openEdit(fixture);

    el(fixture).querySelector<HTMLButtonElement>('.ai-settings__test')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture).textContent).toContain('Clé API refusée');
    // Corriger le formulaire efface le verdict périmé.
    fixture.componentInstance.form.controls.apiKey.setValue('sk-corrigée');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el(fixture).textContent).not.toContain('Clé API refusée');
  });

  it('model combobox: no probe without a key, then suggestions load on focus and filter', async () => {
    const fixture = setup(NO_CONFIG);
    service.listModels.mockResolvedValue(['claude-sonnet-5', 'claude-opus-5']);
    await openNew(fixture);

    const component = fixture.componentInstance;
    component.form.controls.provider.setValue('anthropic');
    await fixture.whenStable();
    fixture.detectChanges();

    const modelInput = el(fixture).querySelector('input[role="combobox"]') as HTMLInputElement;
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    // Clé requise et aucune enregistrée : pas de sonde, pas de listbox, hint affiché.
    expect(service.listModels).not.toHaveBeenCalled();
    expect(el(fixture).querySelector('[role="listbox"]')).toBeNull();
    expect(el(fixture).textContent).toContain('suggestions de modèles');

    component.form.controls.apiKey.setValue('sk-x');
    await fixture.whenStable();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();

    // Création : pas de config_id.
    expect(service.listModels).toHaveBeenCalledWith({
      provider: 'anthropic',
      api_key: 'sk-x',
      base_url: null,
    });
    const optionTexts = () =>
      Array.from(
        el(fixture).querySelectorAll('[role="option"]'),
        (o) => (o as HTMLElement).textContent!.trim(),
      );
    expect(optionTexts()).toEqual(['claude-sonnet-5', 'claude-opus-5']);

    // La saisie filtre les suggestions.
    component.form.controls.model.setValue('opus');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(optionTexts()).toEqual(['claude-opus-5']);

    // Le clic sur une option remplit le champ et referme la listbox.
    (el(fixture).querySelector('[role="option"]') as HTMLElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.form.controls.model.value).toBe('claude-opus-5');
    expect(el(fixture).querySelector('[role="listbox"]')).toBeNull();

    // Changer de provider purge : le prochain focus re-sonde.
    component.form.controls.provider.setValue('mistral');
    await fixture.whenStable();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.listModels).toHaveBeenCalledTimes(2);
  });

  it('model combobox on a stored configuration probes with its config_id (stored key)', async () => {
    const fixture = setup(STORED);
    service.listModels.mockResolvedValue(['claude-sonnet-5', 'claude-opus-5']);
    await openEdit(fixture);

    const modelInput = el(fixture).querySelector('input[role="combobox"]') as HTMLInputElement;
    fixture.componentInstance.form.controls.model.setValue('');
    await fixture.whenStable();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.listModels).toHaveBeenCalledWith({
      provider: 'anthropic',
      base_url: null,
      config_id: CLAUDE_ID,
    });

    modelInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await fixture.whenStable();
    fixture.detectChanges();
    const active = el(fixture).querySelector('[aria-selected="true"]') as HTMLElement;
    expect(active.textContent!.trim()).toBe('claude-sonnet-5');
    expect(modelInput.getAttribute('aria-activedescendant')).toBe(active.id);

    modelInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.model.value).toBe('claude-sonnet-5');
    expect(el(fixture).querySelector('[role="listbox"]')).toBeNull();
  });

  it('model combobox: probe failure shows the error once, retried after fixing the key', async () => {
    const fixture = setup(STORED);
    service.listModels.mockRejectedValue(new HttpErrorResponse({ status: 400 }));
    await openEdit(fixture);

    const modelInput = el(fixture).querySelector('input[role="combobox"]') as HTMLInputElement;
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Clé API refusée');
    expect(el(fixture).querySelector('[role="listbox"]')).toBeNull();

    // Refocus sans rien corriger : pas de nouvelle sonde en boucle.
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    expect(service.listModels).toHaveBeenCalledTimes(1);

    // Corriger la clé efface l'erreur et rouvre la porte à une sonde.
    service.listModels.mockResolvedValue(['gpt-4o']);
    fixture.componentInstance.form.controls.apiKey.setValue('sk-corrigée');
    await fixture.whenStable();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.listModels).toHaveBeenCalledTimes(2);
    expect(el(fixture).textContent).not.toContain('Clé API refusée');
  });

  it('model combobox is not offered for huggingface', async () => {
    const fixture = setup(STORED);
    await openEdit(fixture);
    const modelInput = el(fixture).querySelector('input[role="combobox"]') as HTMLInputElement;
    expect(modelInput).toBeTruthy();

    fixture.componentInstance.form.controls.provider.setValue('huggingface');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(modelInput.getAttribute('role')).toBeNull();
    modelInput.dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    expect(service.listModels).not.toHaveBeenCalled();
  });
});
