import { isStudentUrl, scrubEvent, scrubProperties, scrubUrl } from './scrub';

describe('scrubUrl', () => {
  it('replaces the share token, which is a capability URL', () => {
    expect(scrubUrl('/fr/shared/AbC123-xyz_TOKEN')).toBe('/fr/shared/:token');
  });

  it('replaces the share token and the block id together', () => {
    expect(
      scrubUrl('/fr/shared/AbC123-xyz_TOKEN/blocks/0f8fad5b-d9cb-469f-a165-70867728950e'),
    ).toBe('/fr/shared/:token/blocks/:id');
  });

  it('replaces uuids on public course routes', () => {
    expect(scrubUrl('/en/p/courses/0f8fad5b-d9cb-469f-a165-70867728950e/modules')).toBe(
      '/en/p/courses/:id/modules',
    );
  });

  it('strips the query string, which carries user input', () => {
    expect(scrubUrl('/fr/search?q=mes%20eleves&page=2')).toBe('/fr/search');
  });

  it('strips the fragment', () => {
    expect(scrubUrl('/fr/courses/0f8fad5b-d9cb-469f-a165-70867728950e?tab=share#top')).toBe(
      '/fr/courses/:id',
    );
  });

  it('keeps the origin of an absolute url', () => {
    expect(scrubUrl('https://preprod.opencartable.com/fr/shared/SECRET/content')).toBe(
      'https://preprod.opencartable.com/fr/shared/:token/content',
    );
  });

  it('leaves an ordinary route untouched', () => {
    expect(scrubUrl('/fr/home')).toBe('/fr/home');
  });

  it('leaves a value that is not a url untouched', () => {
    expect(scrubUrl('block_exercise')).toBe('block_exercise');
  });

  it('is not confused by a trailing slash', () => {
    expect(scrubUrl('/fr/shared/SECRET/')).toBe('/fr/shared/:token/');
  });
});

describe('scrubProperties', () => {
  it('scrubs every string that looks like a url', () => {
    expect(
      scrubProperties({
        $current_url: 'https://opencartable.test/fr/shared/SECRET',
        $pathname: '/fr/shared/SECRET',
        $referrer: '/fr/shared/SECRET/content',
        blocks: 12,
      }),
    ).toEqual({
      $current_url: 'https://opencartable.test/fr/shared/:token',
      $pathname: '/fr/shared/:token',
      $referrer: '/fr/shared/:token/content',
      blocks: 12,
    });
  });

  it('drops the document title, which carries the course title', () => {
    const scrubbed = scrubProperties({ title: 'Les fractions — 6e', $title: 'Les fractions' });
    expect(scrubbed).toEqual({});
  });

  it('walks nested objects and arrays', () => {
    expect(
      scrubProperties({
        nested: { url: '/fr/shared/SECRET' },
        list: ['/fr/shared/SECRET', 'plain'],
      }),
    ).toEqual({
      nested: { url: '/fr/shared/:token' },
      list: ['/fr/shared/:token', 'plain'],
    });
  });

  it('keeps null and booleans as they are', () => {
    expect(scrubProperties({ revealed: false, missing: null })).toEqual({
      revealed: false,
      missing: null,
    });
  });
});

describe('scrubEvent', () => {
  it('scrubs properties, $set and $set_once in place', () => {
    const event = {
      properties: { $current_url: '/fr/shared/SECRET' },
      $set: { $initial_current_url: '/fr/shared/SECRET' },
      $set_once: { $initial_referrer: '/fr/shared/SECRET' },
    };
    scrubEvent(event);
    expect(event.properties['$current_url']).toBe('/fr/shared/:token');
    expect(event.$set['$initial_current_url']).toBe('/fr/shared/:token');
    expect(event.$set_once['$initial_referrer']).toBe('/fr/shared/:token');
  });

  it('tolerates a null event', () => {
    expect(() => scrubEvent(null)).not.toThrow();
  });
});

describe('isStudentUrl', () => {
  it('recognises shared links, public courses and teacher catalogs', () => {
    expect(isStudentUrl('/fr/shared/SECRET/blocks/x')).toBe(true);
    expect(isStudentUrl('/en/p/courses/abc')).toBe(true);
    expect(isStudentUrl('/fr/p/teacher-id')).toBe(true);
  });

  it('does not match teacher pages', () => {
    expect(isStudentUrl('/fr/courses/abc')).toBe(false);
    expect(isStudentUrl('/fr/home')).toBe(false);
    expect(isStudentUrl('/fr/search?q=p')).toBe(false);
  });
});
