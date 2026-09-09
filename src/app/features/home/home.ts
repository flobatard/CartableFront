import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { SeoService } from '../../core/seo/seo.service';
import { Spinner } from '../../shared/spinner/spinner';
import { IlluAi } from './illustrations/illu-ai';
import { IlluCompose } from './illustrations/illu-compose';
import { IlluContent } from './illustrations/illu-content';
import { IlluHero } from './illustrations/illu-hero';
import { IlluModule } from './illustrations/illu-module';
import { IlluSelfHost } from './illustrations/illu-self-host';
import { IlluShare } from './illustrations/illu-share';
import { IlluSovereignty } from './illustrations/illu-sovereignty';
import { IlluTutor } from './illustrations/illu-tutor';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    TranslocoPipe,
    Spinner,
    IlluHero,
    IlluCompose,
    IlluContent,
    IlluModule,
    IlluShare,
    IlluAi,
    IlluTutor,
    IlluSovereignty,
    IlluSelfHost,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  /* Obligation AGPL « réseau » : le lien vers les sources reste présent sur la page publique. */
  protected readonly projectUrl = 'https://github.com/flobatard/OpenCartableFront';

  readonly #router = inject(Router);
  readonly #seo = inject(SeoService);

  protected readonly language = inject(LanguageService);
  protected readonly auth = inject(AuthService);

  /* Listes homogènes : une boucle sur des slugs, la clé i18n se compose dans le template.
     Les groupes hétérogènes (cartes de preuve) restent en clés littérales, greppables. */
  protected readonly aiProviders = [
    'anthropic',
    'openai',
    'gemini',
    'mistral',
    'ollama',
    'huggingface',
    'compatible',
  ];
  protected readonly outOfScope = ['grades', 'messaging', 'classroom'];

  constructor() {
    // Applique les metadata SEO au rendu (serveur/prerender) et les réapplique au switch de langue.
    effect(() => {
      this.language.lang();
      this.#seo.applyHome();
    });
  }

  /* Même patron que le header : la cible de retour est l'URL courante. */
  protected login(): void {
    void this.auth.login(this.#router.url);
  }
}
