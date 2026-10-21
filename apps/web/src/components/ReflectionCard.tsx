import type { Locale } from '@lifesim/content-schema';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REFLECTION_NOTE_MAX,
  REFLECTION_QUESTIONS,
  type ReflectionNode,
} from '../game/reflections.ts';

export function ReflectionCard({
  node,
  locale,
  onSubmit,
}: {
  node: ReflectionNode;
  locale: Locale;
  onSubmit: (option: string | null, note: string | null) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const question = REFLECTION_QUESTIONS.find((q) => q.node === node)!;
  return (
    <section className="reflection-card" aria-labelledby="reflection-heading">
      <div aria-live="polite">
        <p className="eyebrow">{t('reflection.eyebrow')}</p>
        <h2 id="reflection-heading">
          {t('time.ageValue', { age: node })} · {question.question[locale]}
        </h2>
      </div>
      <div className="reflection-options">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="reflection-option"
            onClick={() => onSubmit(option.id, note)}
          >
            {t('reflection.options.' + node + '.' + option.id, {
              defaultValue: option.label[locale],
            })}
          </button>
        ))}
      </div>
      <form
        className="reflection-note"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(null, note);
        }}
      >
        <label htmlFor="reflection-note">{t('reflection.noteLabel')}</label>
        <div className="reflection-note-controls">
          <input
            id="reflection-note"
            type="text"
            maxLength={REFLECTION_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button type="submit">{t('reflection.saveNote')}</button>
        </div>
      </form>
      <button type="button" className="secondary" onClick={() => onSubmit(null, null)}>
        {t('reflection.skip')}
      </button>
    </section>
  );
}
