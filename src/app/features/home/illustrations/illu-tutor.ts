import { Component } from '@angular/core';

/** Une question, la réponse de l'élève, et le retour du tuteur. Décoratif. */
@Component({
  selector: 'app-illu-tutor',
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
      <!-- La question -->
      <rect class="illu__paper" x="24" y="20" width="180" height="40" rx="8" />
      <path d="M40 36h140M40 48h96" />

      <!-- La réponse de l'élève -->
      <rect x="24" y="72" width="180" height="44" rx="8" />
      <path d="M40 88h148M40 100h108" />

      <!-- Le retour du tuteur -->
      <rect class="illu__accent" x="64" y="128" width="200" height="52" rx="10" />
      <path class="illu__accent" d="M96 180l-10 16 26-16z" />
      <circle class="illu__accent-line" cx="92" cy="154" r="11" />
      <polyline class="illu__accent-line" points="86,154 91,159 99,147" />
      <path d="M116 148h130M116 162h96" />
    </svg>
  `,
  styleUrl: './illu.scss',
})
export class IlluTutor {}
