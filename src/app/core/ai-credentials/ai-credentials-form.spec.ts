import {
  alignReasoningWithOptions,
  baseUrlRequired,
  baseUrlVisible,
  buildAiCredentialsForm,
  canListModels,
  isFormComplete,
  keyRequired,
  modelListingSupported,
  modelListPayloadFromForm,
  patchFormFromConfiguration,
  payloadFromConfiguration,
  payloadFromForm,
  reasoningAllowed,
  reasoningEffortVisible,
  reasoningToggleVisible,
  testPayloadFromForm,
} from './ai-credentials-form';
import { AiConfiguration, AiProvider, ReasoningOptions } from './ai-credentials.model';

const ALL_LEVELS: ReasoningOptions = { toggle: ['on', 'off'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], known: true };

const STORED: AiConfiguration = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Claude',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  base_url: null,
  api_key_set: true,
  reasoning: true,
  reasoning_effort: 'high',
  reasoning_options: ALL_LEVELS,
};

/** Valeur complète du formulaire (`setValue` exige tous les contrôles). */
function formValue(partial: {
  provider: AiProvider | null;
  model: string;
  apiKey: string;
  baseUrl: string;
  name?: string;
}) {
  return { name: 'Config', ...partial, reasoning: null, reasoningEffort: null };
}

describe('ai-credentials-form', () => {
  it('patchFormFromConfiguration fills everything except the key (never read back)', () => {
    const form = buildAiCredentialsForm();
    form.controls.apiKey.setValue('résidu');
    patchFormFromConfiguration(form, STORED);

    expect(form.controls.provider.value).toBe('anthropic');
    expect(form.controls.model.value).toBe('claude-sonnet-5');
    expect(form.controls.name.value).toBe('Claude');
    expect(form.controls.apiKey.value).toBe('');
    expect(form.controls.reasoning.value).toBe(true);
    expect(form.controls.reasoningEffort.value).toBe('high');
  });

  it('payloadFromForm OMITS api_key when the field is empty (keep the stored key), trims the name', () => {
    const form = buildAiCredentialsForm();
    patchFormFromConfiguration(form, STORED);
    form.controls.model.setValue('claude-opus-5');
    form.controls.name.setValue('  Opus  ');

    const payload = payloadFromForm(form);
    expect(payload).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5',
      base_url: null,
      reasoning: true,
      reasoning_effort: 'high',
      name: 'Opus',
    });
    expect('api_key' in payload).toBe(false);
  });

  it('payloadFromForm carries the entered key and clears base_url outside ollama/openai_compatible', () => {
    const form = buildAiCredentialsForm();
    form.setValue(
      formValue({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        apiKey: '  sk-nouvelle  ',
        baseUrl: 'https://oubliee.example', // résidu d'un provider précédent
      }),
    );

    expect(payloadFromForm(form)).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      base_url: null,
      reasoning: null,
      reasoning_effort: null,
      api_key: 'sk-nouvelle',
      name: 'Config',
    });
  });

  it('payloadFromForm keeps base_url for ollama', () => {
    const form = buildAiCredentialsForm();
    form.setValue(
      formValue({ provider: 'ollama', model: 'llama3.2', apiKey: '', baseUrl: 'http://pi:11434' }),
    );
    expect(payloadFromForm(form).base_url).toBe('http://pi:11434');
  });

  it('reasoningToggleVisible / reasoningEffortVisible mirror the back capability sets', () => {
    expect(reasoningToggleVisible('anthropic')).toBe(true);
    expect(reasoningToggleVisible('google')).toBe(true);
    expect(reasoningToggleVisible('ollama')).toBe(true);
    expect(reasoningToggleVisible('openai')).toBe(true); // « none » sur gpt-5.1+
    expect(reasoningToggleVisible('mistral')).toBe(false);
    expect(reasoningToggleVisible(null)).toBe(false);

    expect(reasoningEffortVisible('openai')).toBe(true);
    expect(reasoningEffortVisible('openai_compatible')).toBe(true);
    expect(reasoningEffortVisible('mistral')).toBe(false);
    expect(reasoningEffortVisible('huggingface')).toBe(false);
    expect(reasoningEffortVisible(null)).toBe(false);
  });

  it('payloadFromForm nulls the reasoning preferences the provider does not accept', () => {
    const form = buildAiCredentialsForm();
    patchFormFromConfiguration(form, STORED); // anthropic : true / high

    form.controls.provider.setValue('mistral');
    expect(payloadFromForm(form)).toEqual(
      expect.objectContaining({ reasoning: null, reasoning_effort: null }),
    );
  });

  it('alignReasoningWithOptions drops what the model does not offer, keeps the rest', () => {
    const form = buildAiCredentialsForm();
    patchFormFromConfiguration(form, STORED); // true / high

    // Gemini 3 : jamais désactivable, niveaux low/high.
    alignReasoningWithOptions(form, { toggle: ['on'], efforts: ['low', 'high'], known: true });
    expect(form.controls.reasoning.value).toBe(true);
    expect(form.controls.reasoningEffort.value).toBe('high');

    form.controls.reasoning.setValue(false);
    alignReasoningWithOptions(form, { toggle: ['on'], efforts: ['low'], known: true });
    expect(form.controls.reasoning.value).toBeNull(); // « off » non proposé
    expect(form.controls.reasoningEffort.value).toBeNull(); // « high » non proposé

    expect(reasoningAllowed(null, { toggle: [], efforts: [], known: false })).toBe(true);
    expect(reasoningAllowed(true, { toggle: ['off'], efforts: [], known: true })).toBe(false);
  });

  it('payloadFromConfiguration rebuilds the PUT without api_key, same key order as payloadFromForm', () => {
    const payload = payloadFromConfiguration(STORED);
    expect(payload).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      base_url: null,
      reasoning: true,
      reasoning_effort: 'high',
      name: 'Claude',
    });
    expect('api_key' in payload).toBe(false);
    // L'écran de réglages compare les deux snapshots en JSON.
    const form = buildAiCredentialsForm();
    patchFormFromConfiguration(form, STORED);
    expect(JSON.stringify(payloadFromForm(form))).toBe(JSON.stringify(payload));
  });

  it('testPayloadFromForm drops the name and carries config_id only when the key field is empty', () => {
    const form = buildAiCredentialsForm();
    patchFormFromConfiguration(form, STORED);

    const stored = testPayloadFromForm(form, STORED.id);
    expect(stored).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      base_url: null,
      reasoning: true,
      reasoning_effort: 'high',
      config_id: STORED.id,
    });
    expect('name' in stored).toBe(false);

    form.controls.apiKey.setValue('sk-saisie');
    const typed = testPayloadFromForm(form, STORED.id);
    expect(typed.api_key).toBe('sk-saisie');
    expect('config_id' in typed).toBe(false);

    // Création : pas de configuration, donc pas de config_id.
    form.controls.apiKey.setValue('');
    expect('config_id' in testPayloadFromForm(form, null)).toBe(false);
  });

  it('baseUrlVisible / baseUrlRequired follow the provider', () => {
    expect(baseUrlVisible('ollama')).toBe(true);
    expect(baseUrlVisible('openai_compatible')).toBe(true);
    expect(baseUrlVisible('anthropic')).toBe(false);
    expect(baseUrlVisible(null)).toBe(false);
    expect(baseUrlRequired('openai_compatible')).toBe(true);
    expect(baseUrlRequired('ollama')).toBe(false);
  });

  it('keyRequired: cloud provider without a stored key only', () => {
    expect(keyRequired('anthropic', false)).toBe(true);
    expect(keyRequired('anthropic', true)).toBe(false);
    expect(keyRequired('ollama', false)).toBe(false);
    expect(keyRequired(null, false)).toBe(false);
  });

  it('isFormComplete applies the per-provider rules and requires a name', () => {
    const form = buildAiCredentialsForm();
    expect(isFormComplete(form.value, false)).toBe(false);

    form.setValue(formValue({ provider: 'anthropic', model: 'm', apiKey: '', baseUrl: '' }));
    expect(isFormComplete(form.value, false)).toBe(false); // clé requise
    expect(isFormComplete(form.value, true)).toBe(true); // clé déjà enregistrée

    form.controls.apiKey.setValue('sk-x');
    expect(isFormComplete(form.value, false)).toBe(true);
    form.controls.name.setValue('   ');
    expect(isFormComplete(form.value, false)).toBe(false); // nom requis
    form.controls.name.setValue('Config');

    form.setValue(
      formValue({ provider: 'openai_compatible', model: 'm', apiKey: '', baseUrl: '' }),
    );
    expect(isFormComplete(form.value, false)).toBe(false); // base_url requise
    form.controls.baseUrl.setValue('https://groq.example/v1');
    expect(isFormComplete(form.value, false)).toBe(true); // clé optionnelle ici
  });

  it('modelListingSupported: every provider except huggingface (and none)', () => {
    expect(modelListingSupported('anthropic')).toBe(true);
    expect(modelListingSupported('ollama')).toBe(true);
    expect(modelListingSupported('huggingface')).toBe(false);
    expect(modelListingSupported(null)).toBe(false);
  });

  it('canListModels: same rules as completeness, WITHOUT the model nor the name', () => {
    const form = buildAiCredentialsForm();
    expect(canListModels(form.value, false)).toBe(false); // pas de provider

    form.setValue(formValue({ provider: 'anthropic', model: '', apiKey: '', baseUrl: '', name: '' }));
    expect(canListModels(form.value, false)).toBe(false); // clé requise
    expect(canListModels(form.value, true)).toBe(true); // clé déjà enregistrée
    form.controls.apiKey.setValue('sk-x');
    expect(canListModels(form.value, false)).toBe(true); // modèle et nom vides n'empêchent rien

    form.setValue(
      formValue({ provider: 'openai_compatible', model: '', apiKey: '', baseUrl: '' }),
    );
    expect(canListModels(form.value, false)).toBe(false); // base_url requise
    form.controls.baseUrl.setValue('https://groq.example/v1');
    expect(canListModels(form.value, false)).toBe(true);

    form.setValue(formValue({ provider: 'huggingface', model: '', apiKey: 'hf-x', baseUrl: '' }));
    expect(canListModels(form.value, false)).toBe(false); // pas de listing chez hf
  });

  it('modelListPayloadFromForm drops model, name and reasoning; config_id replaces an empty key', () => {
    const form = buildAiCredentialsForm();
    patchFormFromConfiguration(form, STORED); // raisonnement true / high
    form.controls.model.setValue('résidu-ignoré');

    const payload = modelListPayloadFromForm(form, STORED.id);
    expect(payload).toEqual({ provider: 'anthropic', base_url: null, config_id: STORED.id });
    expect('api_key' in payload).toBe(false); // champ vide = clé enregistrée

    form.controls.apiKey.setValue('sk-saisie');
    const typed = modelListPayloadFromForm(form, STORED.id);
    expect(typed.api_key).toBe('sk-saisie');
    expect('config_id' in typed).toBe(false);

    form.controls.apiKey.setValue('');
    expect(modelListPayloadFromForm(form, null)).toEqual({ provider: 'anthropic', base_url: null });
  });
});
