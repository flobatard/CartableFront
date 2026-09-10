import { Component, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { ConsentService } from '../../core/consent/consent.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NativeDialog } from '../../shared/dialog/native-dialog.directive';

/** Compteur de module : ids ARIA uniques par instance (jamais Date.now/Math.random). */
let uid = 0;

/**
 * Bandeau de consentement à la mesure d'audience, et modale de préférences.
 *
 * Monté une seule fois dans le shell (`app.html`), donc présent sur TOUTES les
 * pages, y compris les pages élèves anonymes — ce sont elles qui reçoivent le
 * plus de visiteurs.
 *
 * Le bandeau n'est **pas modal** : il ne vole pas le focus et ne masque pas le
 * cours qu'un élève est en train de lire. Refuser est aussi direct qu'accepter
 * (exigence CNIL) — les deux boutons sont au même niveau, sans repli dans un
 * sous-menu.
 *
 * Rien n'est rendu tant que `ConsentService` n'a pas lu le storage, ce qui
 * n'arrive qu'après hydratation : la home est prerendue, un premier rendu
 * client divergent lèverait NG0500.
 */
@Component({
  selector: 'app-consent-banner',
  imports: [NativeDialog, RouterLink, TranslocoPipe],
  templateUrl: './consent-banner.html',
  styleUrl: './consent-banner.scss',
})
export class ConsentBanner {
  protected readonly consent = inject(ConsentService);
  protected readonly language = inject(LanguageService);
  protected readonly dialog = viewChild(NativeDialog);

  protected readonly titleId = `consent-title-${(uid += 1)}`;

  /** Brouillon de la modale : rien n'est enregistré avant « Enregistrer ». */
  protected readonly draftAnalytics = signal(false);
  protected readonly draftReplay = signal(false);

  constructor() {
    effect(() => {
      const open = this.consent.preferencesOpen();
      const dialog = this.dialog();
      if (!dialog) {
        return;
      }
      if (open) {
        const decision = this.consent.decision();
        this.draftAnalytics.set(decision?.analytics ?? false);
        this.draftReplay.set(decision?.sessionReplay ?? false);
        dialog.open();
      } else {
        dialog.close();
      }
    });
  }

  protected toggleAnalytics(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.draftAnalytics.set(checked);
    if (!checked) {
      // L'enregistrement de session n'a pas de sens sans mesure d'audience.
      this.draftReplay.set(false);
    }
  }

  protected toggleReplay(event: Event): void {
    this.draftReplay.set((event.target as HTMLInputElement).checked);
  }

  protected saveDraft(): void {
    this.consent.save({ analytics: this.draftAnalytics(), sessionReplay: this.draftReplay() });
  }
}
