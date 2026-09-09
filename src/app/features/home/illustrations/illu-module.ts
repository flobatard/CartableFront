import { Component } from '@angular/core';

/** Un module vivant dans son cadre isolé, coupé du réseau. Décoratif. */
@Component({
  selector: 'app-illu-module',
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
      <!-- Le cadre isolé, en pointillé comme dans le cours -->
      <rect x="40" y="32" width="240" height="136" rx="12" stroke-dasharray="5 5" />

      <!-- Les trois éditeurs -->
      <rect class="illu__accent" x="54" y="44" width="48" height="13" rx="4" />
      <rect x="110" y="44" width="48" height="13" rx="4" />
      <rect x="166" y="44" width="48" height="13" rx="4" />

      <!-- L'aperçu, vivant -->
      <rect class="illu__paper" x="54" y="68" width="172" height="84" rx="6" />
      <path d="M68 94h144" />
      <circle class="illu__accent" cx="150" cy="94" r="7" />
      <rect x="68" y="116" width="16" height="28" rx="2" />
      <rect x="92" y="108" width="16" height="36" rx="2" />
      <rect x="116" y="124" width="16" height="20" rx="2" />

      <!-- Sans réseau -->
      <circle class="illu__dot" cx="252" cy="134" r="3.5" />
      <path d="M244 126a11 11 0 0 1 16 0M238 117a19 19 0 0 1 28 0" />
      <path d="M236 143L268 105" />
    </svg>
  `,
  styleUrl: './illu.scss',
})
export class IlluModule {}
