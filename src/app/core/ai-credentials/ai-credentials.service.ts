import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import {
  AiConfigurationPayload,
  AiConnectionTestPayload,
  AiCredentials,
  AiModelListPayload,
  EMPTY_AI_CREDENTIALS,
  ReasoningOptions,
  ReasoningOptionsPayload,
} from './ai-credentials.model';

/** Forme UUID (celle des ids de l'API) — garde avant toute interpolation d'URL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Configurations IA nommées de l'utilisateur courant — variante MUTABLE du
 * patron (`UserProfileService` réduit) sur une COLLECTION : signal source de
 * vérité portant l'enveloppe (liste + active + état de l'IA par défaut),
 * promesse en vol partagée (`ensureLoaded()`, invalidée sur erreur pour le
 * retry), mutations qui remplacent le signal depuis la réponse (toute route
 * mutante renvoie l'enveloppe ; la suppression relit le serveur), purge quand
 * la session OIDC tombe.
 *
 * Le Bearer est attaché automatiquement par l'intercepteur OIDC (URL sous
 * `environment.apiUrl`). La clé API saisie ne fait que TRANSITER dans le
 * payload d'écriture : l'API ne la renvoie jamais (`api_key_set` seul).
 */
@Injectable({ providedIn: 'root' })
export class AiCredentialsService {
  readonly #http = inject(HttpClient);
  readonly #auth = inject(AuthService);
  readonly #url = `${environment.apiUrl}/v1/users/me/ai-credentials`;

  #inflight: Promise<AiCredentials> | undefined;

  readonly #credentials = signal<AiCredentials | null>(null);
  /** Enveloppe chargée (`null` tant qu'aucun GET n'a abouti ou après logout). */
  readonly credentials = this.#credentials.asReadonly();

  constructor() {
    effect(() => {
      if (!this.#auth.isAuthenticated()) {
        this.#credentials.set(null);
        this.#inflight = undefined;
      }
    });
  }

  /**
   * Retourne l'enveloppe (le GET répond 200 même sans configuration — liste
   * vide, `active_id: null`). Appels concurrents partagés.
   */
  ensureLoaded(): Promise<AiCredentials> {
    const cached = this.#credentials();
    if (cached) {
      return Promise.resolve(cached);
    }
    this.#inflight ??= firstValueFrom(this.#http.get<AiCredentials>(this.#url)).then(
      (credentials) => {
        this.#credentials.set(credentials);
        return credentials;
      },
      (error: unknown) => {
        this.#inflight = undefined;
        throw error;
      },
    );
    return this.#inflight;
  }

  /**
   * Relit l'enveloppe depuis le serveur (compteur de quota du jour compris)
   * et remplace le signal — utilisé par le panneau assistant après un tour
   * servi par l'IA par défaut, dont le back vient de consommer le quota.
   * L'échec est relayé (le signal garde alors sa dernière valeur).
   */
  async refresh(): Promise<AiCredentials> {
    const credentials = await firstValueFrom(this.#http.get<AiCredentials>(this.#url));
    this.#credentials.set(credentials);
    return credentials;
  }

  /**
   * Crée une configuration nommée — le back l'ACTIVE aussitôt. La réponse
   * (enveloppe) remplace le signal.
   */
  async create(payload: AiConfigurationPayload): Promise<AiCredentials> {
    const credentials = await firstValueFrom(
      this.#http.post<AiCredentials>(this.#url, payload),
    );
    this.#credentials.set(credentials);
    return credentials;
  }

  /**
   * Remplace une configuration ; un payload SANS `api_key` conserve la clé
   * déjà enregistrée côté serveur. Le statut actif ne change pas. La réponse
   * remplace le signal.
   */
  async update(id: string, payload: AiConfigurationPayload): Promise<AiCredentials> {
    const credentials = await firstValueFrom(
      this.#http.put<AiCredentials>(this.#configUrl(id), payload),
    );
    this.#credentials.set(credentials);
    return credentials;
  }

  /**
   * Supprime une configuration (204) puis RELIT l'enveloppe : supprimer
   * l'active bascule l'utilisateur sur l'IA par défaut, dont l'état
   * (disponibilité, quota du jour) doit être frais. Si la relecture échoue,
   * repli sur l'état local sans la configuration (la suppression, elle, a
   * réussi) — ou l'état vide si rien n'était chargé.
   */
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(this.#configUrl(id)));
    try {
      this.#credentials.set(await firstValueFrom(this.#http.get<AiCredentials>(this.#url)));
    } catch {
      const current = this.#credentials();
      this.#credentials.set(
        current
          ? {
              ...current,
              configurations: current.configurations.filter((c) => c.id !== id),
              active_id: current.active_id === id ? null : current.active_id,
            }
          : EMPTY_AI_CREDENTIALS,
      );
    }
  }

  /**
   * Bascule sur une configuration (`id`) ou sur l'IA par défaut (`null`).
   * La réponse remplace le signal.
   */
  async activate(id: string | null): Promise<AiCredentials> {
    const credentials = await firstValueFrom(
      this.#http.put<AiCredentials>(`${this.#url}/active`, { id }),
    );
    this.#credentials.set(credentials);
    return credentials;
  }

  /**
   * Teste la config du formulaire par un mini-appel provider côté serveur —
   * mêmes champs que l'écriture (`api_key` omise + `config_id` = tester avec
   * la clé enregistrée de cette configuration), jamais de quota. Sans effet
   * sur le signal : rien n'est persisté ; l'échec (HttpErrorResponse
   * 400/404/422/429/503) est relayé à l'appelant.
   */
  async testConnection(payload: AiConnectionTestPayload): Promise<void> {
    await firstValueFrom(this.#http.post<{ ok: boolean }>(`${this.#url}/test`, payload));
  }

  /**
   * Modèles proposés par le provider (auto-complétion du champ modèle) —
   * POST : la clé voyage en body, jamais en query. Sans effet sur le signal.
   */
  async listModels(payload: AiModelListPayload): Promise<string[]> {
    const response = await firstValueFrom(
      this.#http.post<{ models: string[] }>(`${this.#url}/models`, payload),
    );
    return response.models;
  }

  /**
   * Options de raisonnement (bascule, niveaux natifs) que le catalogue back
   * propose pour un couple (provider, modèle) — sonde pure, sans effet sur le
   * signal ; une configuration enregistrée arrive déjà avec les siennes.
   */
  async reasoningOptions(payload: ReasoningOptionsPayload): Promise<ReasoningOptions> {
    return firstValueFrom(
      this.#http.post<ReasoningOptions>(`${this.#url}/reasoning-options`, payload),
    );
  }

  /** URL d'une configuration ; l'id (venu du serveur) est validé en forme avant interpolation. */
  #configUrl(id: string): string {
    if (!UUID_PATTERN.test(id)) {
      throw new Error('Identifiant de configuration IA invalide');
    }
    return `${this.#url}/${id}`;
  }
}
