import { Component } from '@angular/core';

/** Un cours, un lien qui expire, des élèves — et le corrigé qui ne part pas. Décoratif. */
@Component({
  selector: 'app-illu-share',
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
      <!-- Le cours -->
      <rect class="illu__paper" x="14" y="44" width="84" height="100" rx="10" />
      <path d="M28 66h56M28 82h40M28 98h48M28 114h34" />

      <path d="M106 94h16" />
      <polyline points="116,88 122,94 116,100" />

      <!-- Le lien, et son expiration. Trait pré-divisé par l'échelle du groupe. -->
      <g transform="translate(128 72) scale(1.8)" stroke-width="0.97">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </g>
      <path class="illu__accent" d="M142 116h16l-8 12 8 12h-16l8-12z" />

      <path d="M178 94h16" />
      <polyline points="188,88 194,94 188,100" />

      <!-- Les élèves -->
      <circle cx="222" cy="72" r="8" />
      <path d="M209 100a13 13 0 0 1 26 0" />
      <circle cx="254" cy="72" r="8" />
      <path d="M241 100a13 13 0 0 1 26 0" />
      <circle cx="286" cy="72" r="8" />
      <path d="M273 100a13 13 0 0 1 26 0" />

      <!-- Le corrigé, qui ne quitte pas le serveur -->
      <rect class="illu__paper" x="234" y="136" width="48" height="32" rx="5" />
      <path d="M234 140l24 16 24-16" />
      <path d="M230 172L286 132" />
    </svg>
  `,
  styleUrl: './illu.scss',
})
export class IlluShare {}
