import { Component } from '@angular/core';

/** Une petite carte chez soi, et une archive qui repart ailleurs. Décoratif. */
@Component({
  selector: 'app-illu-self-host',
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
      <!-- Chez vous : la machine dans la maison -->
      <path d="M20 84l50-36 50 36M30 84v72h80V84" />
      <rect class="illu__paper" x="44" y="104" width="52" height="36" rx="4" />
      <path d="M50 112h32" stroke-dasharray="2 3" />
      <rect class="illu__accent" x="56" y="120" width="16" height="12" rx="2" />
      <rect x="78" y="121" width="12" height="9" rx="1.5" />

      <!-- L'archive, réimportable ailleurs -->
      <rect class="illu__paper" x="150" y="96" width="52" height="48" rx="6" />
      <path d="M176 96v48" stroke-dasharray="4 4" />
      <rect class="illu__accent" x="171" y="112" width="10" height="14" rx="2" />

      <path d="M212 120h30" />
      <polyline points="236,114 242,120 236,126" />

      <path d="M250 96l30-22 30 22M256 96v48h48V96" />
    </svg>
  `,
  styleUrl: './illu.scss',
})
export class IlluSelfHost {}
