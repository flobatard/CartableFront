import { Component } from '@angular/core';

/** Le produit en un coup d'œil : un cours en blocs, un lien, des élèves. Décoratif. */
@Component({
  selector: 'app-illu-hero',
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
      <!-- Le cours : une carte à trois blocs -->
      <rect class="illu__paper" x="16" y="38" width="94" height="124" rx="10" />
      <rect class="illu__accent" x="28" y="52" width="70" height="22" rx="6" />
      <rect x="28" y="84" width="70" height="22" rx="6" />
      <rect x="28" y="116" width="70" height="22" rx="6" />

      <path d="M120 100h20" />
      <polyline points="134,94 140,100 134,106" />

      <!-- Le lien de partage. Le groupe est mis à l'échelle, donc son trait est
           pré-divisé d'autant pour retomber sur les 1.75 du reste du dessin. -->
      <g transform="translate(146 77) scale(1.9)" stroke-width="0.92">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </g>

      <path d="M198 100h20" />
      <polyline points="212,94 218,100 212,106" />

      <!-- Les élèves, sans compte -->
      <circle cx="238" cy="98" r="9" />
      <path d="M224 124a14 14 0 0 1 28 0" />
      <circle cx="268" cy="98" r="9" />
      <path d="M254 124a14 14 0 0 1 28 0" />
      <circle cx="298" cy="98" r="9" />
      <path d="M284 124a14 14 0 0 1 28 0" />
    </svg>
  `,
  styleUrl: './illu.scss',
})
export class IlluHero {}
