import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Meter } from './Archive.tsx';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('archive meter rendering', () => {
  it('keeps missing values honest and excludes them from progressbar semantics', () => {
    const html = renderToStaticMarkup(
      createElement(Meter, { label: 'Health', tone: 'health', value: null }),
    );
    expect(html).toContain('meter is-pending');
    expect(html).toContain('aria-label="ui.pending"');
    expect(html).toContain('—');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain('aria-valuenow');
    expect(html).not.toContain('meter-fill');
  });

  it('renders real values with matching visible and accessible integers', () => {
    const html = renderToStaticMarkup(
      createElement(Meter, { label: 'Health', tone: 'health', value: 0.733333 }),
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="73"');
    expect(html).toContain('width:73%');
    expect(html).toContain('class="meter-value">73</span>');
  });
});
