import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ConsentService } from '../consent/consent.service';
import { AnalyticsService } from './analytics.service';

/**
 * posthog-js est chargé par un `import()` dynamique : le mock intercepte le
 * module, et `imported` compte les chargements réels — c'est lui qui garde
 * l'invariant « rien n'est téléchargé avant consentement ».
 */
const posthog = {
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  opt_out_capturing: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
};
let imported = 0;

vi.mock('posthog-js', () => {
  imported += 1;
  return { default: posthog };
});

@Component({ template: '' })
class Host {}

describe('AnalyticsService', () => {
  const analytics = environment.analytics;
  const initial = { ...analytics };

  beforeEach(() => {
    localStorage.clear();
    imported = 0;
    vi.clearAllMocks();
    Object.assign(analytics, { enabled: true, posthogKey: 'phc_test', sessionReplay: true });
  });

  afterEach(() => {
    Object.assign(analytics, initial);
  });

  /** Monte un composant : `ConsentService` lit son storage dans `afterNextRender`. */
  async function setup(): Promise<{ service: AnalyticsService; consent: ConsentService }> {
    const consent = TestBed.inject(ConsentService);
    const service = TestBed.inject(AnalyticsService);
    TestBed.createComponent(Host).detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    return { service, consent };
  }

  /** Laisse tourner les effects, puis le `import()` dynamique et sa suite. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
      await TestBed.inject(ApplicationRef).whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  it('does not load posthog before a decision is taken', async () => {
    await setup();
    await settle();
    expect(imported).toBe(0);
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('does not load posthog when the environment disables analytics', async () => {
    Object.assign(analytics, { enabled: false });
    const { service, consent } = await setup();
    consent.acceptAll();
    service.capture('module_created', {});
    await settle();
    expect(imported).toBe(0);
  });

  it('does not load posthog when consent is refused', async () => {
    const { consent } = await setup();
    consent.rejectAll();
    await settle();
    expect(imported).toBe(0);
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('loads and initialises posthog once consent is granted', async () => {
    const { consent } = await setup();
    consent.acceptAll();
    await settle();
    expect(imported).toBe(1);
    expect(posthog.init).toHaveBeenCalledOnce();
    const [key, config] = posthog.init.mock.calls[0];
    expect(key).toBe('phc_test');
    expect(config.persistence).toBe('localStorage+cookie');
    expect(config.autocapture).toBe(true);
    expect(config.capture_pageview).toBe('history_change');
    expect(config.person_profiles).toBe('always');
    expect(config.disable_surveys).toBe(true);
    // Le replay démarre à la demande, jamais au chargement.
    expect(config.disable_session_recording).toBe(true);
  });

  it('never cuts /flags: replay, heatmaps and autocapture read their config there', async () => {
    const { consent } = await setup();
    consent.acceptAll();
    await settle();
    const config = posthog.init.mock.calls[0][1];
    // `advanced_disable_flags: true` ferait taire `startSessionRecording()`.
    expect(config.advanced_disable_flags).toBeUndefined();
  });

  it('masks inputs and model output in session recordings', async () => {
    const { consent } = await setup();
    consent.acceptAll();
    await settle();
    const { session_recording } = posthog.init.mock.calls[0][1];
    expect(session_recording.maskAllInputs).toBe(true);
    expect(session_recording.maskTextSelector).toContain('.exercise-view__revealed-answer');
    expect(session_recording.maskTextSelector).toContain('.course-chat__thread');
  });

  it('scrubs outgoing events through before_send', async () => {
    const { consent } = await setup();
    consent.acceptAll();
    await settle();
    const { before_send } = posthog.init.mock.calls[0][1];
    const event = { properties: { $current_url: '/fr/shared/SECRET', title: 'Les fractions' } };
    expect(before_send(event)).toBe(event);
    expect(event.properties['$current_url']).toBe('/fr/shared/:token');
    expect(event.properties['title']).toBeUndefined();
  });

  it('replays events queued before the library was ready', async () => {
    const { service, consent } = await setup();
    service.capture('course_created', { source: 'blank' });
    consent.acceptAll();
    await settle();
    expect(posthog.capture).toHaveBeenCalledWith('course_created', { source: 'blank' });
  });

  it('drops events queued before a refusal', async () => {
    const { service, consent } = await setup();
    service.capture('course_created', { source: 'blank' });
    consent.rejectAll();
    await settle();
    consent.acceptAll();
    await settle();
    expect(posthog.capture).not.toHaveBeenCalledWith('course_created', { source: 'blank' });
  });

  it('captures directly once loaded', async () => {
    const { service, consent } = await setup();
    consent.acceptAll();
    await settle();
    service.capture('course_viewed', { access: 'token', blocks: 3 });
    expect(posthog.capture).toHaveBeenCalledWith('course_viewed', { access: 'token', blocks: 3 });
  });

  it('identifies with the oidc sub, including one pending from before the load', async () => {
    const { service, consent } = await setup();
    service.identify('sub-123');
    consent.acceptAll();
    await settle();
    expect(posthog.identify).toHaveBeenCalledWith('sub-123');
  });

  it('starts session replay only off student pages', async () => {
    const { service, consent } = await setup();
    consent.acceptAll();
    await settle();
    expect(posthog.startSessionRecording).toHaveBeenCalled();

    posthog.stopSessionRecording.mockClear();
    service.trackNavigation('/fr/shared/SECRET/content');
    await settle();
    expect(posthog.stopSessionRecording).toHaveBeenCalled();
  });

  it('never starts session replay when only analytics is accepted', async () => {
    const { consent } = await setup();
    consent.save({ analytics: true, sessionReplay: false });
    await settle();
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });

  it('opts out and purges when consent is revoked', async () => {
    const { consent } = await setup();
    consent.acceptAll();
    await settle();
    consent.rejectAll();
    await settle();
    expect(posthog.stopSessionRecording).toHaveBeenCalled();
    expect(posthog.reset).toHaveBeenCalled();
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
  });
});
