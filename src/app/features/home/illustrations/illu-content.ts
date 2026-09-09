import { Component } from '@angular/core';

/** Une page de cours : du texte, une fraction, un organigramme, une parabole. Décoratif. */
@Component({
  selector: 'app-illu-content',
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
      <rect class="illu__paper" x="16" y="16" width="288" height="168" rx="12" />
      <path d="M36 40h150M36 52h108" />

      <!-- Une fraction -->
      <rect class="illu__accent" x="54" y="86" width="32" height="9" rx="4.5" />
      <path d="M46 106h48" />
      <rect x="58" y="117" width="24" height="9" rx="4.5" />

      <!-- Un organigramme -->
      <rect x="132" y="74" width="44" height="20" rx="5" />
      <path d="M154 94v10" />
      <path d="M154 104l16 12-16 12-16-12z" />
      <path d="M154 128v16" />
      <rect x="132" y="144" width="44" height="20" rx="5" />

      <!-- Une figure : parabole sur un repère -->
      <path d="M218 152h78M232 168V80" />
      <path class="illu__accent-line" d="M240 94Q264 200 290 94" />
    </svg>
  `,
  styleUrl: './illu.scss',
})
export class IlluContent {}
