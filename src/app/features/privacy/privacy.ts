import { Component, effect, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { ConsentService } from '../../core/consent/consent.service';
import { LanguageService } from '../../core/i18n/language.service';
import { SeoService } from '../../core/seo/seo.service';

/**
 * Politique de confidentialité. Page statique, prerendue dans les deux langues :
 * elle doit être lisible AVANT toute décision de consentement, et rester
 * accessible à un visiteur qui a tout refusé.
 *
 * Aucune lecture de storage ici : le seul état affiché est celui de la modale,
 * ouverte à la demande. Le contenu vit dans `i18n/{fr,en}/privacy.json` et
 * contient des marqueurs « À COMPLÉTER » que l'exploitant de l'instance doit
 * renseigner (raison sociale, adresse, contact, hébergeur, durées).
 */
@Component({
  selector: 'app-privacy',
  imports: [TranslocoPipe],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss',
})
export class Privacy {
  readonly #seo = inject(SeoService);
  readonly #language = inject(LanguageService);

  protected readonly consent = inject(ConsentService);

  constructor() {
    effect(() => {
      // Dépendance à la langue active : les balises se réécrivent à la bascule.
      this.#language.lang();
      this.#seo.apply({
        titleKey: 'privacy.metaTitle',
        descriptionKey: 'privacy.metaDescription',
        path: 'privacy',
      });
    });
  }
}
