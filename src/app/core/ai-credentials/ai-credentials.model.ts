/**
 * Configurations IA nommées de l'utilisateur — miroir du contrat API
 * `/v1/users/me/ai-credentials` (snake_case conservé, convention du repo).
 *
 * La ressource est une collection : `AiCredentials` est l'ENVELOPPE (liste
 * des configurations, id de l'active, état de l'IA par défaut) renvoyée par
 * le GET et par toute route mutante — le service remplace son signal d'un
 * bloc. Aucune configuration active = l'IA par défaut du serveur.
 *
 * La clé API n'est JAMAIS renvoyée par l'API : seul `api_key_set`
 * indique qu'une clé est enregistrée (chiffrée côté serveur).
 */

/** Valeurs de l'enum `AIProvider` du back, dans l'ordre d'affichage. */
export const AI_PROVIDERS = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'ollama',
  'openai_compatible',
  'huggingface',
] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Providers pour lesquels le champ base_url est proposé (openai_compatible l'exige). */
export const PROVIDERS_WITH_BASE_URL: readonly AiProvider[] = ['ollama', 'openai_compatible'];

/** Providers dont la clé API est facultative (miroir du back). */
export const PROVIDERS_KEY_OPTIONAL: readonly AiProvider[] = ['ollama', 'openai_compatible'];

/**
 * Providers dont l'API sait lister les modèles disponibles (miroir du back
 * `PROVIDERS_WITH_MODEL_LISTING`) — huggingface en est exclu (le Hub entier
 * n'est pas un catalogue exploitable).
 */
export const PROVIDERS_WITH_MODEL_LISTING: readonly AiProvider[] = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'ollama',
  'openai_compatible',
];

/** Plafond de configurations par utilisateur (miroir du back `MAX_CONFIGURATIONS`). */
export const AI_CONFIGURATIONS_MAX = 10;

/** Longueur maximale du nom d'une configuration (miroir du back). */
export const AI_CONFIGURATION_NAME_MAX_LENGTH = 100;

/**
 * Niveaux d'effort NATIFS connus de l'UI (libellés i18n) — un niveau inconnu
 * proposé par le catalogue back s'affiche tel quel. Les niveaux réellement
 * proposés viennent du back, par couple (provider, modèle).
 */
export const KNOWN_REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/** Bascule du raisonnement : « on » = demandé et affiché, « off » = coupé. */
export type ReasoningToggle = 'on' | 'off';

/**
 * Options de raisonnement à proposer pour un couple (provider, modèle) —
 * miroir de `ReasoningOptionsRead` du back (catalogue `app/core/ai/reasoning.py`) :
 * `toggle` = sous-ensemble de ['on', 'off'] (vide = pas de bascule),
 * `efforts` = niveaux natifs dans l'ordre croissant (vide = pas d'effort),
 * `known` = modèle reconnu (sinon options génériques du provider).
 */
export interface ReasoningOptions {
  toggle: readonly ReasoningToggle[];
  efforts: readonly string[];
  known: boolean;
}

export const EMPTY_REASONING_OPTIONS: ReasoningOptions = { toggle: [], efforts: [], known: false };

/**
 * Providers dont le raisonnement peut être forcé (et affiché) ou coupé —
 * miroir du back `PROVIDERS_WITH_REASONING_TOGGLE` (app/core/ai/types.py) ;
 * gating par provider du payload, l'affichage suit le catalogue par modèle.
 */
export const PROVIDERS_WITH_REASONING_TOGGLE: readonly AiProvider[] = [
  'anthropic',
  'openai',
  'openai_compatible',
  'google',
  'ollama',
];

/**
 * Providers acceptant un niveau d'effort portable — miroir du back
 * `PROVIDERS_WITH_REASONING_EFFORT` (mistral et huggingface : rien).
 */
export const PROVIDERS_WITH_REASONING_EFFORT: readonly AiProvider[] = [
  'anthropic',
  'openai',
  'openai_compatible',
  'google',
  'ollama',
];

/** Une configuration nommée, sans sa clé (miroir de `AIConfigurationRead`). */
export interface AiConfiguration {
  id: string;
  /** Libellé choisi par l'utilisateur (listes de bascule). */
  name: string;
  provider: AiProvider;
  model: string;
  base_url: string | null;
  api_key_set: boolean;
  /** Raisonnement : `null` = défaut du modèle, `true` = demandé et affiché, `false` = coupé. */
  reasoning: boolean | null;
  /** Niveau d'effort NATIF du provider ; `null` = défaut du modèle. */
  reasoning_effort: string | null;
  /** Options du catalogue pour le couple enregistré. */
  reasoning_options: ReasoningOptions;
}

/** Enveloppe de la collection (miroir de `AICredentialsRead`). */
export interface AiCredentials {
  /** De la plus ancienne à la plus récente. */
  configurations: AiConfiguration[];
  /** Configuration utilisée par les chats et le tuteur ; `null` = IA par défaut. */
  active_id: string | null;
  /** L'IA par défaut (fallback serveur) est proposée par ce serveur. */
  default_ai_available: boolean;
  /** Plafond quotidien effectif de l'IA par défaut ; 0 = illimité. */
  daily_quota: number;
  /** Appels déjà servis par l'IA par défaut aujourd'hui (jour UTC). */
  calls_today: number;
  /** Provider servi par l'IA par défaut (`null` sans fallback serveur). */
  default_provider: string | null;
  /** Modèle servi par l'IA par défaut (`null` sans fallback serveur). */
  default_model: string | null;
}

/**
 * État « rien de configuré » — repli seulement (les infos de quota y sont
 * inconnues) : après un DELETE réussi le service RELIT le serveur.
 */
export const EMPTY_AI_CREDENTIALS: AiCredentials = {
  configurations: [],
  active_id: null,
  default_ai_available: false,
  daily_quota: 0,
  calls_today: 0,
  default_provider: null,
  default_model: null,
};

/** La configuration active de l'enveloppe, `null` pour l'IA par défaut (ou sans état). */
export function activeConfiguration(creds: AiCredentials | null): AiConfiguration | null {
  if (!creds || creds.active_id === null) {
    return null;
  }
  return creds.configurations.find((c) => c.id === creds.active_id) ?? null;
}

/** Champs d'une configuration tels que saisis (base du POST, du PUT et du test). */
export interface AiCredentialsPayload {
  provider: AiProvider;
  model: string;
  /** OMIS (jamais `null` explicite) = conserver la clé déjà enregistrée. */
  api_key?: string;
  base_url: string | null;
  /** Toujours envoyés : `null` quand le provider ne les accepte pas (422 sinon). */
  reasoning: boolean | null;
  reasoning_effort: string | null;
}

/** Corps du `POST /users/me/ai-credentials` (création) et du `PUT /{id}` (remplacement). */
export interface AiConfigurationPayload extends AiCredentialsPayload {
  name: string;
}

/**
 * Corps du `POST /users/me/ai-credentials/test` : les champs sans le nom ;
 * `api_key` omise + `config_id` = tester avec la clé enregistrée de CETTE
 * configuration (omise sans `config_id` = aucune clé).
 */
export interface AiConnectionTestPayload extends AiCredentialsPayload {
  config_id?: string;
}

/**
 * Corps du `POST /users/me/ai-credentials/reasoning-options` : sonde pure du
 * catalogue pour le couple saisi (ni clé, ni base_url).
 */
export interface ReasoningOptionsPayload {
  provider: AiProvider;
  model: string;
}

/**
 * Corps du `POST /users/me/ai-credentials/models` (listing des modèles d'un
 * provider) : pas de `model` — c'est lui qu'on cherche —, même sémantique de
 * clé que le test (omise + `config_id` = clé enregistrée côté serveur).
 */
export interface AiModelListPayload {
  provider: AiProvider;
  api_key?: string;
  base_url: string | null;
  config_id?: string;
}
