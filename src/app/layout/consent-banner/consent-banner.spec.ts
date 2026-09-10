import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { CONSENT_STORAGE_KEY } from '../../core/consent/consent.model';
import { ConsentService } from '../../core/consent/consent.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { ConsentBanner } from './consent-banner';

/**
 * jsdom n'implémente pas la vraie modalité de <dialog> : on espionne
 * `showModal`/`close` plutôt que d'observer l'état `open`.
 */
describe('ConsentBanner', () => {
  const analytics = environment.analytics;
  const initial = { ...analytics };

  beforeEach(() => {
    localStorage.clear();
    Object.assign(analytics, { enabled: true, posthogKey: 'phc_test', sessionReplay: true });
  });

  afterEach(() => {
    Object.assign(analytics, initial);
  });

  async function createComponent(): Promise<ComponentFixture<ConsentBanner>> {
    await TestBed.configureTestingModule({
      imports: [ConsentBanner, provideTranslocoTesting()],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConsentBanner);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function host(fixture: ComponentFixture<ConsentBanner>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function banner(fixture: ComponentFixture<ConsentBanner>): HTMLElement | null {
    return host(fixture).querySelector('.consent');
  }

  function actions(fixture: ComponentFixture<ConsentBanner>): HTMLButtonElement[] {
    return [...host(fixture).querySelectorAll<HTMLButtonElement>('.consent__actions .btn')];
  }

  it('offers accept, reject and customise at the same level', async () => {
    const fixture = await createComponent();
    expect(banner(fixture)).not.toBeNull();
    // Refuser doit être aussi direct qu'accepter (exigence CNIL) : trois
    // boutons voisins, aucun caché derrière un sous-menu.
    expect(actions(fixture)).toHaveLength(3);
  });

  it('renders nothing when the environment disables analytics', async () => {
    Object.assign(analytics, { enabled: false });
    const fixture = await createComponent();
    expect(banner(fixture)).toBeNull();
    expect(host(fixture).querySelector('dialog')).toBeNull();
  });

  it('accepting everything stores the decision and hides the banner', async () => {
    const fixture = await createComponent();
    actions(fixture)[0].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(banner(fixture)).toBeNull();
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!).analytics).toBe(true);
  });

  it('rejecting everything stores the refusal and hides the banner', async () => {
    const fixture = await createComponent();
    actions(fixture)[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(banner(fixture)).toBeNull();
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!).analytics).toBe(false);
  });

  it('customising opens the preferences dialog', async () => {
    const fixture = await createComponent();
    const dialog = host(fixture).querySelector('dialog')!;
    const showModal = (dialog.showModal = vi.fn());
    actions(fixture)[2].click();
    await fixture.whenStable();
    expect(showModal).toHaveBeenCalledOnce();
  });

  it('saves exactly what was ticked in the dialog', async () => {
    const fixture = await createComponent();
    TestBed.inject(ConsentService).openPreferences();
    await fixture.whenStable();
    fixture.detectChanges();

    const boxes = [
      ...host(fixture).querySelectorAll<HTMLInputElement>('.consent-prefs__choice input'),
    ];
    // La première case est le socle nécessaire au fonctionnement : non désactivable.
    expect(boxes[0].disabled).toBe(true);
    boxes[1].checked = true;
    boxes[1].dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    host(fixture).querySelector<HTMLButtonElement>('.consent-prefs__foot .btn--secondary')!.click();
    await fixture.whenStable();

    const stored = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!);
    expect(stored.analytics).toBe(true);
    expect(stored.sessionReplay).toBe(false);
  });

  it('keeps session replay unavailable until analytics is ticked', async () => {
    const fixture = await createComponent();
    TestBed.inject(ConsentService).openPreferences();
    await fixture.whenStable();
    fixture.detectChanges();

    const boxes = [
      ...host(fixture).querySelectorAll<HTMLInputElement>('.consent-prefs__choice input'),
    ];
    expect(boxes[2].disabled).toBe(true);
  });

  it('does not offer session replay when the environment does not', async () => {
    Object.assign(analytics, { sessionReplay: false });
    const fixture = await createComponent();
    TestBed.inject(ConsentService).openPreferences();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      host(fixture).querySelectorAll('.consent-prefs__choice input'),
    ).toHaveLength(2);
  });

  it('closing the dialog natively (Escape) clears the open state', async () => {
    const fixture = await createComponent();
    const consent = TestBed.inject(ConsentService);
    consent.openPreferences();
    await fixture.whenStable();

    host(fixture).querySelector('dialog')!.dispatchEvent(new Event('close'));
    await fixture.whenStable();
    expect(consent.preferencesOpen()).toBe(false);
  });

  it('reopens for a visitor whose stored decision has expired', async () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        analytics: true,
        sessionReplay: false,
        date: new Date(Date.now() - 200 * 86_400_000).toISOString(),
      }),
    );
    const fixture = await createComponent();
    expect(banner(fixture)).not.toBeNull();
  });
});
