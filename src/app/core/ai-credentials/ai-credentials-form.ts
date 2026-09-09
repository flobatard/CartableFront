import { FormControl, FormGroup } from '@angular/forms';
import {
  AiConfiguration,
  AiConfigurationPayload,
  AiConnectionTestPayload,
  AiCredentialsPayload,
  AiModelListPayload,
  AiProvider,
  PROVIDERS_KEY_OPTIONAL,
  PROVIDERS_WITH_BASE_URL,
  PROVIDERS_WITH_MODEL_LISTING,
  PROVIDERS_WITH_REASONING_EFFORT,
  PROVIDERS_WITH_REASONING_TOGGLE,
  ReasoningOptions,
} from './ai-credentials.model';

/**
 * Helpers purs du formulaire d'une configuration IA (comme `profile-form.ts`).
 *
 * Contrat clé API : elle n'est JAMAIS renvoyée par l'API, donc jamais
 * patchée dans le formulaire ; un champ laissé vide signifie « conserver la
 * clé enregistrée » et le payload OMET alors `api_key`.
 *
 * Préférences de raisonnement : toujours envoyées, `null` quand le provider
 * ne les accepte pas (miroirs des frozensets du back), comme `base_url` ;
 * les options réellement proposées viennent du catalogue back par couple
 * (provider, modèle) — `alignReasoningWithOptions` y ramène le formulaire.
 */

export function buildAiCredentialsForm() {
  return new FormGroup({
    provider: new FormControl<AiProvider | null>(null),
    model: new FormControl('', { nonNullable: true }),
    apiKey: new FormControl('', { nonNullable: true }),
    baseUrl: new FormControl('', { nonNullable: true }),
    name: new FormControl('', { nonNullable: true }),
    reasoning: new FormControl<boolean | null>(null),
    reasoningEffort: new FormControl<string | null>(null),
  });
}

export type AiCredentialsForm = ReturnType<typeof buildAiCredentialsForm>;

/** Valeur vide du formulaire (création, remise à zéro). */
export const EMPTY_FORM_VALUE = {
  provider: null,
  model: '',
  apiKey: '',
  baseUrl: '',
  name: '',
  reasoning: null,
  reasoningEffort: null,
} as const;

/** Pré-remplit nom/provider/modèle/base_url/raisonnement — la clé, jamais relue, reste vide. */
export function patchFormFromConfiguration(form: AiCredentialsForm, config: AiConfiguration): void {
  form.controls.provider.setValue(config.provider);
  form.controls.model.setValue(config.model);
  form.controls.baseUrl.setValue(config.base_url ?? '');
  form.controls.apiKey.setValue('');
  form.controls.name.setValue(config.name);
  form.controls.reasoning.setValue(config.reasoning);
  form.controls.reasoningEffort.setValue(config.reasoning_effort);
}

/** Le champ base_url n'est proposé que pour ollama / openai_compatible. */
export function baseUrlVisible(provider: AiProvider | null): boolean {
  return provider !== null && PROVIDERS_WITH_BASE_URL.includes(provider);
}

/** Le provider accepte une bascule du raisonnement (gating du payload). */
export function reasoningToggleVisible(provider: AiProvider | null): boolean {
  return provider !== null && PROVIDERS_WITH_REASONING_TOGGLE.includes(provider);
}

/** Le provider accepte un niveau d'effort (gating du payload). */
export function reasoningEffortVisible(provider: AiProvider | null): boolean {
  return provider !== null && PROVIDERS_WITH_REASONING_EFFORT.includes(provider);
}

/** La bascule enregistrée (`true`/`false`) figure dans les options du modèle. */
export function reasoningAllowed(reasoning: boolean | null, options: ReasoningOptions): boolean {
  return reasoning === null || options.toggle.includes(reasoning ? 'on' : 'off');
}

/**
 * Ramène les préférences du formulaire dans les options du modèle affiché :
 * une valeur que le catalogue ne propose pas (bascule ou niveau) repasse à
 * `null` — jamais une valeur muette dans un `<select>` sans option.
 */
export function alignReasoningWithOptions(form: AiCredentialsForm, options: ReasoningOptions): void {
  if (!reasoningAllowed(form.controls.reasoning.value, options)) {
    form.controls.reasoning.setValue(null);
  }
  const effort = form.controls.reasoningEffort.value;
  if (effort !== null && !options.efforts.includes(effort)) {
    form.controls.reasoningEffort.setValue(null);
  }
}

export function baseUrlRequired(provider: AiProvider | null): boolean {
  return provider === 'openai_compatible';
}

/** Clé requise pour un provider cloud tant qu'aucune clé n'est enregistrée. */
export function keyRequired(provider: AiProvider | null, apiKeySet: boolean): boolean {
  if (provider === null || PROVIDERS_KEY_OPTIONAL.includes(provider)) {
    return false;
  }
  return !apiKeySet;
}

/**
 * Champs d'écriture depuis le formulaire (sans le nom) : `api_key` OMISE si
 * le champ est vide (= conserver la clé enregistrée) ; base_url et
 * préférences de raisonnement vidées pour les providers qui ne les acceptent
 * pas (le back les refuserait en 422).
 */
export function fieldsFromForm(form: AiCredentialsForm): AiCredentialsPayload {
  const v = form.getRawValue();
  const provider = v.provider as AiProvider;
  const payload: AiCredentialsPayload = {
    provider,
    model: v.model.trim(),
    base_url: baseUrlVisible(provider) ? v.baseUrl.trim() || null : null,
    reasoning: reasoningToggleVisible(provider) ? v.reasoning : null,
    reasoning_effort: reasoningEffortVisible(provider) ? v.reasoningEffort : null,
  };
  const apiKey = v.apiKey.trim();
  if (apiKey) {
    payload.api_key = apiKey;
  }
  return payload;
}

/** Corps du POST (création) et du PUT `/{id}` : les champs + le nom (trimé). */
export function payloadFromForm(form: AiCredentialsForm): AiConfigurationPayload {
  return { ...fieldsFromForm(form), name: form.getRawValue().name.trim() };
}

/**
 * Corps du `POST .../test` : les champs sans le nom (le back le refuserait
 * en 422) ; `config_id` de la configuration éditée pour qu'un champ clé vide
 * signifie « tester avec sa clé enregistrée ».
 */
export function testPayloadFromForm(
  form: AiCredentialsForm,
  configId: string | null,
): AiConnectionTestPayload {
  const payload: AiConnectionTestPayload = fieldsFromForm(form);
  if (configId !== null && payload.api_key === undefined) {
    payload.config_id = configId;
  }
  return payload;
}

/**
 * Corps du PUT reconstruit depuis la configuration ENREGISTRÉE, sans
 * `api_key` (= conservée) : le pied du chat s'en sert pour enregistrer une
 * préférence de raisonnement de la configuration active en modifiant un seul
 * champ. Même ORDRE de clés que `payloadFromForm` : l'écran de réglages
 * compare les deux en JSON pour détecter un formulaire non modifié.
 */
export function payloadFromConfiguration(config: AiConfiguration): AiConfigurationPayload {
  return {
    provider: config.provider,
    model: config.model,
    base_url: config.base_url,
    reasoning: config.reasoning,
    reasoning_effort: config.reasoning_effort,
    name: config.name,
  };
}

/** Règles de complétude (mêmes que la validation back), nom compris. */
export function isFormComplete(v: AiCredentialsForm['value'], apiKeySet: boolean): boolean {
  const provider = v.provider ?? null;
  if (!provider || !v.model?.trim() || !v.name?.trim()) {
    return false;
  }
  if (keyRequired(provider, apiKeySet) && !v.apiKey?.trim()) {
    return false;
  }
  if (baseUrlRequired(provider) && !v.baseUrl?.trim()) {
    return false;
  }
  return true;
}

/** L'auto-complétion des modèles est proposée pour ce provider. */
export function modelListingSupported(provider: AiProvider | null): boolean {
  return provider !== null && PROVIDERS_WITH_MODEL_LISTING.includes(provider);
}

/**
 * Le listing des modèles est lançable : provider listable, clé disponible
 * (saisie ou déjà enregistrée), base_url si requise — la complétude du
 * formulaire SANS le modèle ni le nom (c'est justement le modèle qu'on cherche).
 */
export function canListModels(v: AiCredentialsForm['value'], apiKeySet: boolean): boolean {
  const provider = v.provider ?? null;
  if (!modelListingSupported(provider)) {
    return false;
  }
  if (keyRequired(provider, apiKeySet) && !v.apiKey?.trim()) {
    return false;
  }
  if (baseUrlRequired(provider) && !v.baseUrl?.trim()) {
    return false;
  }
  return true;
}

/**
 * Corps du `POST .../models` : les champs sans `model` ni préférences de
 * raisonnement (le back refuse tout champ inconnu en 422) ; `config_id` de la
 * configuration éditée quand le champ clé est vide (= sa clé enregistrée).
 */
export function modelListPayloadFromForm(
  form: AiCredentialsForm,
  configId: string | null,
): AiModelListPayload {
  const {
    model: _model,
    reasoning: _reasoning,
    reasoning_effort: _reasoningEffort,
    ...payload
  } = fieldsFromForm(form);
  const result: AiModelListPayload = payload;
  if (configId !== null && result.api_key === undefined) {
    result.config_id = configId;
  }
  return result;
}
