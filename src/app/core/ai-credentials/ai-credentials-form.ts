import { FormControl, FormGroup } from '@angular/forms';
import {
  AiCredentials,
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
 * Helpers purs du formulaire de credential IA (comme `profile-form.ts`).
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
    reasoning: new FormControl<boolean | null>(null),
    reasoningEffort: new FormControl<string | null>(null),
  });
}

export type AiCredentialsForm = ReturnType<typeof buildAiCredentialsForm>;

/** Pré-remplit provider/modèle/base_url/raisonnement — la clé, jamais relue, reste vide. */
export function patchFormFromCredentials(form: AiCredentialsForm, creds: AiCredentials): void {
  form.controls.provider.setValue(creds.provider);
  form.controls.model.setValue(creds.model ?? '');
  form.controls.baseUrl.setValue(creds.base_url ?? '');
  form.controls.apiKey.setValue('');
  form.controls.reasoning.setValue(creds.reasoning);
  form.controls.reasoningEffort.setValue(creds.reasoning_effort);
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
 * Corps du `PUT /users/me/ai-credentials` : `api_key` OMISE si le champ est
 * vide (= conserver la clé enregistrée) ; base_url et préférences de
 * raisonnement vidées pour les providers qui ne les acceptent pas (le back
 * les refuserait en 422).
 */
export function payloadFromForm(form: AiCredentialsForm): AiCredentialsPayload {
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

/**
 * Corps du PUT reconstruit depuis le credential ENREGISTRÉ, sans `api_key`
 * (= conservée) : le pied du chat s'en sert pour enregistrer une préférence
 * de raisonnement en modifiant un seul champ. `null` sans config personnelle.
 */
export function payloadFromCredentials(creds: AiCredentials): AiCredentialsPayload | null {
  if (creds.provider === null || creds.model === null) {
    return null;
  }
  return {
    provider: creds.provider,
    model: creds.model,
    base_url: creds.base_url,
    reasoning: creds.reasoning,
    reasoning_effort: creds.reasoning_effort,
  };
}

/** Règles de complétude (mêmes que la validation back). */
export function isFormComplete(v: AiCredentialsForm['value'], apiKeySet: boolean): boolean {
  const provider = v.provider ?? null;
  if (!provider || !v.model?.trim()) {
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
 * formulaire SANS le modèle (c'est justement lui qu'on cherche).
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
 * Corps du `POST .../models` : `payloadFromForm` sans le champ `model` ni les
 * préférences de raisonnement (le back refuse tout champ inconnu en 422).
 */
export function modelListPayloadFromForm(form: AiCredentialsForm): AiModelListPayload {
  const {
    model: _model,
    reasoning: _reasoning,
    reasoning_effort: _reasoningEffort,
    ...payload
  } = payloadFromForm(form);
  return payload;
}
