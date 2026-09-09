import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Home } from './home';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { provideTranslocoTesting } from '../../testing/transloco-testing';

describe('Home', () => {
  const isAuthenticated = signal(false);
  const loggingIn = signal(false);
  const authMock = {
    isAuthenticated,
    loggingIn,
    login: vi.fn().mockResolvedValue(undefined),
  };

  const create = async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  beforeEach(async () => {
    isAuthenticated.set(false);
    loggingIn.set(false);
    authMock.login.mockClear();

    await TestBed.configureTestingModule({
      imports: [Home, provideTranslocoTesting()],
      providers: [provideRouter([]), { provide: AuthService, useValue: authMock }],
    }).compileComponents();
  });

  it('n’expose qu’un seul h1', async () => {
    const { el } = await create();

    expect(el.querySelectorAll('h1')).toHaveLength(1);
  });

  it('nomme chacune de ses sections par un titre existant', async () => {
    const { el } = await create();
    const sections = [...el.querySelectorAll('section')];

    expect(sections).toHaveLength(10);
    for (const section of sections) {
      const labelledBy = section.getAttribute('aria-labelledby');
      // Le hero se passe d'aria-labelledby : il porte le h1, seul titre de la page.
      if (!labelledBy) {
        expect(section.querySelector('h1')).toBeTruthy();
        continue;
      }
      expect(el.querySelector(`#${labelledBy}`)).toBeTruthy();
    }
  });

  it('rend le contenu français des sections', async () => {
    const { el } = await create();

    expect(el.textContent).toContain('Composez vos cours, partagez-les par un lien');
    expect(el.textContent).toContain('Glissez un module web dans le cours');
    expect(el.textContent).toContain("Partagez d'un lien, sans compte élève");
    expect(el.textContent).toContain('Un assistant qui écrit avec vous');
    expect(el.textContent).toContain('Un tuteur qui corrige vos élèves');
    expect(el.textContent).toContain('Votre clé, votre modèle');
    expect(el.textContent).toContain("Ce qu'OpenCartable n'est pas");
  });

  it('ne laisse échapper aucune clé de traduction brute', async () => {
    const { el } = await create();

    // Sans missingHandler, une clé absente s'affiche telle quelle : ce test attrape
    // toute faute de frappe, y compris dans les clés composées des boucles @for.
    expect(el.textContent).not.toContain('home.');
  });

  it('connecte le visiteur en le ramenant sur l’URL courante', async () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/fr/home');
    const { el } = await create();

    el.querySelector<HTMLButtonElement>('.home-hero .btn--primary')?.click();

    expect(authMock.login).toHaveBeenCalledWith('/fr/home');
  });

  it('désactive le bouton et montre un spinner pendant la connexion', async () => {
    const { fixture, el } = await create();
    const button = el.querySelector<HTMLButtonElement>('.home-hero .btn--primary');

    expect(button?.querySelector('app-spinner')).toBeNull();

    loggingIn.set(true);
    fixture.detectChanges();

    expect(button?.disabled).toBe(true);
    expect(button?.querySelector('app-spinner')).toBeTruthy();
  });

  it('remplace la connexion par un lien vers les cours une fois authentifié', async () => {
    isAuthenticated.set(true);
    const { el } = await create();

    expect(el.querySelector('button.btn--primary')).toBeNull();
    expect(el.querySelector<HTMLAnchorElement>('.home-hero a.btn--primary')?.getAttribute('href'))
      .toBe('/fr/courses');
    expect(el.textContent).toContain('Ouvrir mes cours');
  });

  it('renvoie vers la recherche publique depuis le hero et la clôture', async () => {
    const { el } = await create();
    const secondary = [...el.querySelectorAll<HTMLAnchorElement>('a.btn--secondary')];

    expect(secondary.map((link) => link.getAttribute('href'))).toEqual([
      '/fr/search',
      '/fr/search',
    ]);
  });

  it('renvoie vers la documentation des langages', async () => {
    const { el } = await create();
    const hrefs = [...el.querySelectorAll<HTMLAnchorElement>('a')].map((a) =>
      a.getAttribute('href'),
    );

    expect(hrefs).toContain('/fr/markdown-language/docs');
  });

  it('garde le lien vers les sources discret', async () => {
    const { el } = await create();
    const sources = [...el.querySelectorAll<HTMLAnchorElement>('a[href*="github.com"]')];

    // Obligation AGPL « réseau » : le lien reste là, mais ce n'est pas le CTA.
    expect(sources.length).toBeGreaterThan(0);
    for (const link of sources) {
      expect(link.getAttribute('rel')).toBe('noopener');
      expect(link.classList.contains('btn--primary')).toBe(false);
    }
  });

  it('ne pose que des illustrations décoratives, et aucune image', async () => {
    const { el } = await create();
    const svgs = [...el.querySelectorAll('svg')];

    expect(svgs.length).toBeGreaterThanOrEqual(9);
    expect(svgs.every((svg) => svg.getAttribute('aria-hidden') === 'true')).toBe(true);
    // Le swap de thème passe par les tokens : plus aucun couple d'images clair/sombre.
    expect(el.querySelectorAll('img')).toHaveLength(0);
  });

  it('bascule en anglais', async () => {
    const { fixture, el } = await create();

    TestBed.inject(LanguageService).activate('en');
    fixture.detectChanges();

    expect(el.textContent).toContain('Compose your courses, share them by link');
    expect(el.textContent).toContain('A tutor that marks your students');
    expect(el.textContent).toContain('What OpenCartable is not');
  });
});
