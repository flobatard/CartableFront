import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import {
  AiCredentials,
  EMPTY_AI_CREDENTIALS,
  EMPTY_REASONING_OPTIONS,
} from '../../../core/ai-credentials/ai-credentials.model';
import { AiCredentialsService } from '../../../core/ai-credentials/ai-credentials.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { mockAssistantChatState } from '../../../testing/assistant.fixture';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { CourseChatSettings } from './course-chat-settings';

/** Config personnelle Anthropic (bascule + niveaux natifs du catalogue), sans préférence posée. */
const CUSTOM: AiCredentials = {
  ...EMPTY_AI_CREDENTIALS,
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  api_key_set: true,
  reasoning_options: { toggle: ['on', 'off'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], known: true },
};

/** IA par défaut du serveur : jamais de préférence de raisonnement. */
const DEFAULT_AI: AiCredentials = {
  ...EMPTY_AI_CREDENTIALS,
  default_ai_available: true,
  daily_quota: 30,
  calls_today: 3,
  default_provider: 'anthropic',
  default_model: 'claude-sonnet-5',
};

describe('CourseChatSettings — reasoning preferences', () => {
  let credentials: ReturnType<typeof signal<AiCredentials | null>>;
  let service: {
    credentials: ReturnType<typeof signal<AiCredentials | null>>;
    ensureLoaded: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let notifications: { error: ReturnType<typeof vi.fn> };

  async function setup(initial: AiCredentials): Promise<ComponentFixture<CourseChatSettings>> {
    credentials = signal<AiCredentials | null>(initial);
    service = {
      credentials,
      ensureLoaded: vi.fn().mockResolvedValue(initial),
      refresh: vi.fn().mockResolvedValue(initial),
      save: vi.fn().mockResolvedValue(initial),
    };
    notifications = { error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [CourseChatSettings, provideTranslocoTesting()],
      providers: [
        { provide: AiCredentialsService, useValue: service },
        { provide: NotificationService, useValue: notifications },
        { provide: LanguageService, useValue: { lang: () => 'fr' } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CourseChatSettings);
    fixture.componentRef.setInput('assistant', mockAssistantChatState());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function selects(fixture: ComponentFixture<CourseChatSettings>): HTMLSelectElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.chat-settings__select'),
    );
  }

  function change(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  it('shows nothing for the default AI nor for a provider without reasoning capability', async () => {
    expect(selects(await setup(DEFAULT_AI))).toHaveLength(0);
    TestBed.resetTestingModule();
    const mistral = { ...CUSTOM, provider: 'mistral' as const, reasoning_options: EMPTY_REASONING_OPTIONS };
    expect(selects(await setup(mistral))).toHaveLength(0);
  });

  it('offers the selectors and options of the catalogue: both for claude-sonnet-5, effort alone for gpt-5', async () => {
    const both = selects(await setup(CUSTOM));
    expect(both).toHaveLength(2);
    expect(both[0].getAttribute('aria-label')).toBe('Raisonnement du modèle');
    expect(both[1].getAttribute('aria-label')).toBe('Effort de raisonnement');
    expect(Array.from(both[1].options, (o) => o.value)).toEqual([
      '',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
    expect(both[1].options[4].textContent!.trim()).toBe('Effort · très élevé');

    TestBed.resetTestingModule();
    const gpt5 = {
      ...CUSTOM,
      provider: 'openai' as const,
      model: 'gpt-5',
      reasoning_options: {
        toggle: [],
        efforts: ['minimal', 'low', 'medium', 'high'],
        known: true,
      },
    };
    const effortOnly = selects(await setup(gpt5));
    expect(effortOnly).toHaveLength(1);
    expect(effortOnly[0].getAttribute('aria-label')).toBe('Effort de raisonnement');
    expect(effortOnly[0].options[1].value).toBe('minimal');
  });

  it('hides the “off” option when the model cannot be switched off (Gemini 3)', async () => {
    const gemini3 = {
      ...CUSTOM,
      provider: 'google' as const,
      model: 'gemini-3-pro-preview',
      reasoning_options: { toggle: ['on' as const], efforts: ['low', 'high'], known: true },
    };
    const [reasoning, effort] = selects(await setup(gemini3));
    expect(Array.from(reasoning.options, (o) => o.value)).toEqual(['', 'on']);
    expect(Array.from(effort.options, (o) => o.value)).toEqual(['', 'low', 'high']);
  });

  it('reflects the stored preferences in the selected options', async () => {
    const [reasoning, effort] = selects(
      await setup({ ...CUSTOM, reasoning: false, reasoning_effort: 'high' }),
    );
    expect(reasoning.value).toBe('off');
    expect(effort.value).toBe('high');
  });

  it('a change saves the rebuilt credential (key omitted) and freezes the selectors meanwhile', async () => {
    const fixture = await setup(CUSTOM);
    let resolveSave!: (creds: AiCredentials) => void;
    service.save.mockImplementation(
      () => new Promise<AiCredentials>((resolve) => (resolveSave = resolve)),
    );

    const [reasoning, effort] = selects(fixture);
    change(reasoning, 'on');
    fixture.detectChanges();

    expect(service.save).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      base_url: null,
      reasoning: true,
      reasoning_effort: null,
    });
    expect('api_key' in service.save.mock.calls[0][0]).toBe(false);
    expect(reasoning.disabled).toBe(true);
    expect(effort.disabled).toBe(true);

    // Le vrai service écrit la réponse dans le signal avant de résoudre.
    const saved = { ...CUSTOM, reasoning: true };
    credentials.set(saved);
    resolveSave(saved);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(reasoning.disabled).toBe(false);
    expect(reasoning.value).toBe('on');

    change(effort, 'high');
    expect(service.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ reasoning: true, reasoning_effort: 'high' }),
    );
  });

  it('a failed save reverts the selector to the stored value and shows a toast', async () => {
    const fixture = await setup({ ...CUSTOM, reasoning_effort: 'low' });
    service.save.mockRejectedValue(new Error('500'));

    const [, effort] = selects(fixture);
    change(effort, 'high');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(effort.value).toBe('low');
    expect(effort.disabled).toBe(false);
    expect(notifications.error).toHaveBeenCalledWith(
      'Réglage de raisonnement non enregistré — réessayez.',
    );
  });
});
