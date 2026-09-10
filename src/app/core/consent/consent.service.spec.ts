import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from './consent.model';
import { ConsentService } from './consent.service';

/**
 * `ConsentService` lit le storage dans `afterNextRender` (la home est prerendue,
 * lire avant hydratation lèverait NG0500) : les specs doivent donc créer un
 * composant et attendre la stabilité pour que la lecture ait lieu.
 */
@Component({ template: '' })
class Host {}

describe('ConsentService', () => {
  const analytics = environment.analytics;
  const initial = { ...analytics };

  beforeEach(() => {
    localStorage.clear();
    Object.assign(analytics, { enabled: true, posthogKey: 'phc_test', sessionReplay: true });
  });

  afterEach(() => {
    Object.assign(analytics, initial);
  });

  /** Monte un composant et laisse tourner `afterNextRender`. */
  async function createService(): Promise<ConsentService> {
    const service = TestBed.inject(ConsentService);
    TestBed.createComponent(Host).detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    return service;
  }

  function store(decision: Record<string, unknown>): void {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(decision));
  }

  it('asks for a decision when nothing is stored', async () => {
    const service = await createService();
    expect(service.needsBanner()).toBe(true);
    expect(service.analyticsGranted()).toBe(false);
  });

  it('grants nothing before hydration has resolved the storage', () => {
    const service = TestBed.inject(ConsentService);
    expect(service.resolved()).toBe(false);
    expect(service.needsBanner()).toBe(false);
    expect(service.analyticsGranted()).toBe(false);
  });

  it('stays silent when the environment disables analytics', async () => {
    Object.assign(analytics, { enabled: false });
    const service = await createService();
    expect(service.configured).toBe(false);
    expect(service.needsBanner()).toBe(false);
  });

  it('stays silent when the posthog key is not filled in', async () => {
    Object.assign(analytics, { posthogKey: '  ' });
    const service = await createService();
    expect(service.configured).toBe(false);
    expect(service.needsBanner()).toBe(false);
  });

  it('acceptAll grants both and persists the decision', async () => {
    const service = await createService();
    service.acceptAll();
    expect(service.analyticsGranted()).toBe(true);
    expect(service.sessionReplayGranted()).toBe(true);
    expect(service.needsBanner()).toBe(false);
    const stored = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!);
    expect(stored.version).toBe(CONSENT_VERSION);
    expect(stored.analytics).toBe(true);
    expect(stored.sessionReplay).toBe(true);
  });

  it('rejectAll persists the refusal, so the banner does not come back', async () => {
    const service = await createService();
    service.rejectAll();
    expect(service.analyticsGranted()).toBe(false);
    expect(service.needsBanner()).toBe(false);
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!).analytics).toBe(false);
  });

  it('never grants session replay without analytics', async () => {
    const service = await createService();
    service.save({ analytics: false, sessionReplay: true });
    expect(service.sessionReplayGranted()).toBe(false);
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!).sessionReplay).toBe(false);
  });

  it('never grants session replay when the environment does not offer it', async () => {
    Object.assign(analytics, { sessionReplay: false });
    const service = await createService();
    service.acceptAll();
    expect(service.analyticsGranted()).toBe(true);
    expect(service.sessionReplayGranted()).toBe(false);
  });

  it('restores a stored decision', async () => {
    store({
      version: CONSENT_VERSION,
      analytics: true,
      sessionReplay: false,
      date: new Date().toISOString(),
    });
    const service = await createService();
    expect(service.analyticsGranted()).toBe(true);
    expect(service.sessionReplayGranted()).toBe(false);
    expect(service.needsBanner()).toBe(false);
  });

  it('asks again when the stored decision uses an older contract version', async () => {
    store({
      version: CONSENT_VERSION - 1,
      analytics: true,
      sessionReplay: true,
      date: new Date().toISOString(),
    });
    const service = await createService();
    expect(service.needsBanner()).toBe(true);
    expect(service.analyticsGranted()).toBe(false);
  });

  it('asks again when the stored decision has expired', async () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    store({ version: CONSENT_VERSION, analytics: true, sessionReplay: false, date: old });
    const service = await createService();
    expect(service.needsBanner()).toBe(true);
    expect(service.analyticsGranted()).toBe(false);
  });

  it('asks again when the stored value is not usable', async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'not json');
    const service = await createService();
    expect(service.needsBanner()).toBe(true);
  });

  it('measures nothing when the storage refuses to write', async () => {
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const service = await createService();
    // Sans trace possible du choix, on ne demande rien et on ne mesure rien.
    expect(service.needsBanner()).toBe(false);
    expect(service.analyticsGranted()).toBe(false);
    setItem.mockRestore();
  });

  it('opens and closes the preferences dialog', async () => {
    const service = await createService();
    expect(service.preferencesOpen()).toBe(false);
    service.openPreferences();
    expect(service.preferencesOpen()).toBe(true);
    service.acceptAll();
    expect(service.preferencesOpen()).toBe(false);
  });
});
