import { Component } from '@angular/core';

/** Quatre blocs à poignée de déplacement, le deuxième saisi au clavier. Décoratif. */
@Component({
  selector: 'app-illu-compose',
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
      <!-- Bloc texte -->
      <rect class="illu__paper" x="26" y="22" width="250" height="34" rx="8" />
      <circle class="illu__dot" cx="40" cy="33" r="1.7" />
      <circle class="illu__dot" cx="48" cy="33" r="1.7" />
      <circle class="illu__dot" cx="40" cy="39" r="1.7" />
      <circle class="illu__dot" cx="48" cy="39" r="1.7" />
      <circle class="illu__dot" cx="40" cy="45" r="1.7" />
      <circle class="illu__dot" cx="48" cy="45" r="1.7" />
      <path d="M238 35h24M238 43h16" />

      <!-- Bloc exercice, saisi : liseré de focus et chevrons de déplacement -->
      <rect class="illu__accent" x="26" y="64" width="250" height="34" rx="8" />
      <rect x="22" y="60" width="258" height="42" rx="10" stroke-width="2" />
      <circle class="illu__dot" cx="40" cy="75" r="1.7" />
      <circle class="illu__dot" cx="48" cy="75" r="1.7" />
      <circle class="illu__dot" cx="40" cy="81" r="1.7" />
      <circle class="illu__dot" cx="48" cy="81" r="1.7" />
      <circle class="illu__dot" cx="40" cy="87" r="1.7" />
      <circle class="illu__dot" cx="48" cy="87" r="1.7" />
      <circle cx="250" cy="81" r="9" />
      <polyline points="246,81 249,84 255,77" />

      <!-- Bloc document -->
      <rect class="illu__paper" x="26" y="106" width="250" height="34" rx="8" />
      <circle class="illu__dot" cx="40" cy="117" r="1.7" />
      <circle class="illu__dot" cx="48" cy="117" r="1.7" />
      <circle class="illu__dot" cx="40" cy="123" r="1.7" />
      <circle class="illu__dot" cx="48" cy="123" r="1.7" />
      <circle class="illu__dot" cx="40" cy="129" r="1.7" />
      <circle class="illu__dot" cx="48" cy="129" r="1.7" />
      <path d="M243 114h10l6 6v12h-16zM253 114v6h6" />

      <!-- Bloc module interactif -->
      <rect class="illu__paper" x="26" y="148" width="250" height="34" rx="8" />
      <circle class="illu__dot" cx="40" cy="159" r="1.7" />
      <circle class="illu__dot" cx="48" cy="159" r="1.7" />
      <circle class="illu__dot" cx="40" cy="165" r="1.7" />
      <circle class="illu__dot" cx="48" cy="165" r="1.7" />
      <circle class="illu__dot" cx="40" cy="171" r="1.7" />
      <circle class="illu__dot" cx="48" cy="171" r="1.7" />
      <path d="M244 158l12 7-12 7z" />
    </svg>
  `,
  styleUrl: './illu.scss',
})
export class IlluCompose {}
