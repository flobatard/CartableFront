import { Component } from '@angular/core';

/**
 * Une proposition comparée au texte d'origine, à accepter ou à refuser. Décoratif.
 * Les signes + et − portent l'information ; la couleur ne fait que l'appuyer.
 */
@Component({
  selector: 'app-illu-ai',
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
      <rect class="illu__paper" x="16" y="20" width="288" height="124" rx="10" />
      <path d="M160 20v124" />

      <!-- Le texte d'origine -->
      <path d="M34 44h104M34 62h84M34 80h96M34 98h72M34 116h90" />

      <!-- La proposition -->
      <path class="illu__plus" d="M174 44h10M179 39v10" />
      <path d="M194 44h88" />
      <path d="M194 62h70" />
      <path class="illu__minus" d="M174 80h10" />
      <path d="M194 80h80" />
      <path class="illu__plus" d="M174 98h10M179 93v10" />
      <path d="M194 98h64" />
      <path d="M194 116h84" />

      <!-- Accepter ou refuser -->
      <rect class="illu__accent" x="88" y="156" width="60" height="28" rx="8" />
      <polyline class="illu__accent-line" points="104,170 112,178 130,162" />
      <rect x="172" y="156" width="60" height="28" rx="8" />
      <path d="M190 164l24 16M214 164l-24 16" />
    </svg>
  `,
  styleUrl: './illu.scss',
})
export class IlluAi {}
