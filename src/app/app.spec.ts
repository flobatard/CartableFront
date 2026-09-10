import { signal } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';
import { ConsentService } from './core/consent/consent.service';
import { environment } from '../environments/environment';
import { provideTranslocoTesting } from './testing/transloco-testing';

describe('App', () => {
  const analytics = environment.analytics;
  const initialAnalytics = { ...analytics };

  afterEach(() => {
    Object.assign(analytics, initialAnalytics);
  });

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');

    await TestBed.configureTestingModule({
      imports: [App, provideTranslocoTesting()],
      // Le bandeau de consentement est derrière un @defer : on veut son vrai
      // chargement, pas le placeholder.
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            displayName: signal<string | null>(null),
            loggingIn: signal(false),
            login: vi.fn().mockResolvedValue(undefined),
            logout: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();
  });

  it('crée l’application', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('rend le lien d’évitement, le header, le contenu et le footer', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.skip-link')).toBeTruthy();
    expect(el.querySelector('app-header')).toBeTruthy();
    expect(el.querySelector('main#main-content')).toBeTruthy();
    expect(el.querySelector('app-footer')).toBeTruthy();
  });

  it('ne charge pas le bandeau de consentement quand la mesure est désactivée', async () => {
    Object.assign(analytics, { enabled: false, posthogKey: '' });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-consent-banner')).toBeNull();
  });

  it('charge le bandeau quand un choix est attendu', async () => {
    Object.assign(analytics, { enabled: true, posthogKey: 'phc_test' });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-consent-banner'),
    ).not.toBeNull();
  });

  it('charge le bandeau à la demande du pied de page, même après un choix', async () => {
    // Chemin du lien « Cookies » : le choix est fait, la bannière ne s'affiche
    // plus, mais la modale de préférences doit rester atteignable.
    Object.assign(analytics, { enabled: true, posthogKey: 'phc_test' });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const consent = TestBed.inject(ConsentService);
    consent.rejectAll();
    fixture.detectChanges();
    await fixture.whenStable();

    consent.openPreferences();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-consent-banner'),
    ).not.toBeNull();
  });
});
