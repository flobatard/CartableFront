import { Component } from '@angular/core';

/**
 * Une clé au centre, sept fournisseurs autour, dont un servi depuis la maison.
 * Formes neutres et volontairement anonymes : aucun logo de marque. Décoratif.
 */
@Component({
  selector: 'app-illu-sovereignty',
  template: `
    <svg
      class="illu"
      viewBox="0 0 320 200"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="160" cy="100" r="68" stroke-dasharray="4 6" />

      <!-- Le fournisseur local, chez vous -->
      <circle class="illu__accent" cx="160" cy="32" r="15" />
      <path class="illu__accent-line" d="M153 37v-7l7-5 7 5v7z" />

      <circle class="illu__paper" cx="213" cy="58" r="13" />
      <circle class="illu__paper" cx="226" cy="115" r="13" />
      <circle class="illu__paper" cx="190" cy="161" r="13" />
      <circle class="illu__paper" cx="130" cy="161" r="13" />
      <circle class="illu__paper" cx="94" cy="115" r="13" />
      <circle class="illu__paper" cx="107" cy="58" r="13" />

      <!-- Votre clé -->
      <circle class="illu__accent-line" cx="142" cy="100" r="14" />
      <circle class="illu__accent-line" cx="142" cy="100" r="5" />
      <path class="illu__accent-line" d="M156 100h40M182 100v10M192 100v7" />
    </svg>
  `,
  styleUrl: './illu.scss',
})
export class IlluSovereignty {}
