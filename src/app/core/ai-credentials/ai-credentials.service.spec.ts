import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AiConfiguration, AiCredentials, EMPTY_AI_CREDENTIALS } from './ai-credentials.model';
import { AiCredentialsService } from './ai-credentials.service';

const CONFIG_ID = '11111111-1111-4111-8111-111111111111';

const CONFIG: AiConfiguration = {
  id: CONFIG_ID,
  name: 'Claude',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  base_url: null,
  api_key_set: true,
  reasoning: null,
  reasoning_effort: null,
  reasoning_options: { toggle: ['on', 'off'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], known: true },
};

const CREDENTIALS: AiCredentials = {
  configurations: [CONFIG],
  active_id: CONFIG_ID,
  default_ai_available: true,
  daily_quota: 30,
  calls_today: 0,
  default_provider: 'mistral',
  default_model: 'ministral-14b-latest',
};

const PAYLOAD = {
  provider: 'anthropic' as const,
  model: 'claude-sonnet-5',
  base_url: null,
  reasoning: true,
  reasoning_effort: 'high',
  name: 'Claude',
};

describe('AiCredentialsService', () => {
  let service: AiCredentialsService;
  let httpMock: HttpTestingController;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  const url = `${environment.apiUrl}/v1/users/me/ai-credentials`;

  beforeEach(() => {
    isAuthenticated = signal(true);
    TestBed.configureTestingModule({
      providers: [
        AiCredentialsService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: isAuthenticated.asReadonly() } },
      ],
    });
    service = TestBed.inject(AiCredentialsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('issues a single GET for two concurrent ensureLoaded() calls', async () => {
    const first = service.ensureLoaded();
    const second = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);

    expect(await first).toEqual(CREDENTIALS);
    expect(await second).toEqual(CREDENTIALS);
    expect(service.credentials()).toEqual(CREDENTIALS);
  });

  it('invalidates the in-flight request on error: the retry issues a new GET', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).error(new ProgressEvent('network'));
    await expect(first).rejects.toBeTruthy();

    const retry = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);
    expect(await retry).toEqual(CREDENTIALS);
  });

  it('refresh always re-issues a GET and replaces the signal (fresh quota counter)', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);
    await first;

    const refreshed = service.refresh();
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('GET');
    req.flush({ ...CREDENTIALS, calls_today: 7 });

    expect(await refreshed).toEqual({ ...CREDENTIALS, calls_today: 7 });
    expect(service.credentials()?.calls_today).toBe(7);
  });

  it('create POSTs the payload (passed through as-is) and replaces the signal with the envelope', async () => {
    const submit = service.create(PAYLOAD);

    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(PAYLOAD);
    // Un payload sans clé n'invente pas de champ api_key.
    expect('api_key' in (req.request.body as object)).toBe(false);
    req.flush(CREDENTIALS);

    expect(await submit).toEqual(CREDENTIALS);
    expect(service.credentials()).toEqual(CREDENTIALS);
  });

  it('update PUTs to /{id} and replaces the signal', async () => {
    const submit = service.update(CONFIG_ID, { ...PAYLOAD, api_key: 'sk-nouvelle' });

    const req = httpMock.expectOne(`${url}/${CONFIG_ID}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ...PAYLOAD, api_key: 'sk-nouvelle' });
    req.flush(CREDENTIALS);

    expect(await submit).toEqual(CREDENTIALS);
    expect(service.credentials()).toEqual(CREDENTIALS);
  });

  it('update refuses an id that is not UUID-shaped (never interpolated into the URL)', async () => {
    await expect(service.update('../evil', PAYLOAD)).rejects.toThrow();
    httpMock.expectNone(`${url}/../evil`);
  });

  it('activate PUTs {id} to /active, null for the default AI, and replaces the signal', async () => {
    const switched = service.activate(CONFIG_ID);
    let req = httpMock.expectOne(`${url}/active`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ id: CONFIG_ID });
    req.flush(CREDENTIALS);
    expect(await switched).toEqual(CREDENTIALS);

    const reset = service.activate(null);
    req = httpMock.expectOne(`${url}/active`);
    expect(req.request.body).toEqual({ id: null });
    req.flush({ ...CREDENTIALS, active_id: null });
    await reset;
    expect(service.credentials()?.active_id).toBeNull();
  });

  it('remove DELETEs /{id} then RE-READS the envelope (fresh default-AI quota)', async () => {
    const removal = service.remove(CONFIG_ID);
    const req = httpMock.expectOne(`${url}/${CONFIG_ID}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolve) => setTimeout(resolve));

    const fresh: AiCredentials = {
      ...EMPTY_AI_CREDENTIALS,
      default_ai_available: true,
      daily_quota: 30,
      calls_today: 12,
    };
    const reread = httpMock.expectOne(url);
    expect(reread.request.method).toBe('GET');
    reread.flush(fresh);

    await removal;
    expect(service.credentials()).toEqual(fresh);
  });

  it('remove falls back to the local state without the configuration when the re-read fails', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);
    await first;

    const removal = service.remove(CONFIG_ID);
    httpMock
      .expectOne(`${url}/${CONFIG_ID}`)
      .flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolve) => setTimeout(resolve));
    httpMock.expectOne(url).error(new ProgressEvent('network'));

    await removal;
    expect(service.credentials()).toEqual({ ...CREDENTIALS, configurations: [], active_id: null });
  });

  it('testConnection POSTs the fields (config_id, no name) to /test, without touching the signal', async () => {
    const payload = {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-5',
      base_url: null,
      reasoning: null,
      reasoning_effort: null,
      config_id: CONFIG_ID,
    };
    const test = service.testConnection(payload);

    const req = httpMock.expectOne(`${url}/test`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ ok: true });

    await test;
    expect(service.credentials()).toBeNull(); // rien persisté, rien chargé
  });

  it('testConnection relays the provider failure to the caller', async () => {
    const test = service.testConnection({
      provider: 'openai',
      model: 'gpt-4o',
      api_key: 'sk-mauvaise',
      base_url: null,
      reasoning: null,
      reasoning_effort: null,
    });
    httpMock
      .expectOne(`${url}/test`)
      .flush({ detail: 'refusée' }, { status: 400, statusText: 'Bad Request' });
    await expect(test).rejects.toMatchObject({ status: 400 });
  });

  it('listModels POSTs to /models (key in the body, never in the URL) and unwraps the list', async () => {
    const models = service.listModels({ provider: 'ollama', base_url: 'http://pi:11434' });

    const req = httpMock.expectOne(`${url}/models`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ provider: 'ollama', base_url: 'http://pi:11434' });
    req.flush({ models: ['llama3.2:latest', 'qwen3:8b'] });

    expect(await models).toEqual(['llama3.2:latest', 'qwen3:8b']);
  });

  it('reasoningOptions POSTs the (provider, model) pair to /reasoning-options', async () => {
    const options = service.reasoningOptions({ provider: 'openai', model: 'gpt-5.2' });

    const req = httpMock.expectOne(`${url}/reasoning-options`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ provider: 'openai', model: 'gpt-5.2' });
    req.flush({ toggle: ['on', 'off'], efforts: ['low', 'medium', 'high', 'xhigh'], known: true });

    expect(await options).toEqual({
      toggle: ['on', 'off'],
      efforts: ['low', 'medium', 'high', 'xhigh'],
      known: true,
    });
    expect(service.credentials()).toBeNull(); // sonde pure
  });

  it('clears the envelope when the session drops', async () => {
    const first = service.ensureLoaded();
    httpMock.expectOne(url).flush(CREDENTIALS);
    await first;
    expect(service.credentials()).not.toBeNull();

    isAuthenticated.set(false);
    TestBed.tick();

    expect(service.credentials()).toBeNull();
  });
});
