import { describeCharacterLocations } from '@lifesim/real-world';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArchiveCard,
  Field,
  FieldGrid,
  Meter,
  Panel,
  PendingTag,
  type MeterTone,
} from '../components/Archive.tsx';
import { LanguageSwitch } from '../components/LanguageSwitch.tsx';
import { PixelAvatar, PixelScene } from '../components/PixelPortrait.tsx';
import { PlacePolityLabel } from '../components/PlacePolityLabel.tsx';
import { PolityFlag } from '../components/PolityFlag.tsx';
import { archiveIndexLine, archiveNumber } from '../game/archive.ts';
import { GameSession } from '../game/session.ts';
import { currentLocale } from '../i18n/index.ts';
import type { LifeStage } from '../pixel/avatar.ts';
import '../styles/design.css';

/**
 * 设计系统预览（M4-022 UI-01，只在开发环境的 `#design` 可见）。
 * 档案卡的字段来自一局真实会话（固定种子）；状态条的数字只是组件示意，页面上写明。
 */

const TOKENS = [
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-soft',
  '--color-primary-tint',
  '--color-primary-strong',
  '--color-on-primary',
  '--color-background',
  '--color-surface',
  '--color-surface-muted',
  '--color-paper',
  '--color-text',
  '--color-text-secondary',
  '--color-border',
  '--color-border-strong',
  '--color-success',
  '--color-warning',
  '--color-danger',
] as const;

const STAGES: readonly [LifeStage, number][] = [
  ['infant', 1],
  ['child', 8],
  ['teen', 15],
  ['adult', 35],
  ['elder', 72],
];

const SAMPLE_METERS: readonly [MeterTone, number | null][] = [
  ['health', 0.71],
  ['happiness', 0.66],
  ['knowledge', 0.46],
  ['relationships', 0.54],
  ['economy', null],
];

const SPEEDS = ['1×', '2×', '4×', '16×'] as const;

export function DesignPreviewPage() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('1×');
  const session = useMemo(() => {
    const created = GameSession.create({
      seed: 'design-preview',
      region: 'JP',
      year: 1978,
      birthDate: '1978-05-04',
    });
    created.settleBirthDay();
    return created;
  }, []);
  const snapshot = session.simulation.snapshot();
  const actor = snapshot.actors.find((candidate) => candidate.id === snapshot.activeCharacterId);
  const locations = actor
    ? describeCharacterLocations(session.pack, actor, session.clock, locale)
    : null;
  const archive = {
    seed: session.request.seed,
    packId: session.birth.packId,
    birthDate: session.birth.birthDate,
  };

  return (
    <div className="shell design-preview">
      <header className="masthead">
        <div className="brand">
          <div>
            <h1>{t('design.heading')}</h1>
            <p className="tagline">{t('design.lead')}</p>
          </div>
        </div>
        <LanguageSwitch />
      </header>
      <p className="stage-notice" role="note">
        {t('design.sampleValues')}
      </p>

      <div className="design-grid">
        <Panel headingId="design-tokens" title={t('design.tokens')}>
          <ul className="swatch-list">
            {TOKENS.map((token) => (
              <li key={token}>
                <span className="swatch" style={{ background: `var(${token})` }} />
                <code>{token}</code>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel headingId="design-type" title={t('design.type')}>
          <p className="display-name">{t('design.sampleName')}</p>
          <h2>{t('play.status.heading')}</h2>
          <p>{t('design.sampleRecord')}</p>
          <p className="hint">{t('play.status.pendingNote')}</p>
          <p className="index-strip">{archiveIndexLine(archive)}</p>
        </Panel>

        <Panel headingId="design-controls" title={t('design.controls')}>
          <div className="toolbar">
            <button type="button" className="primary">
              {t('creation.start')}
            </button>
            <button type="button" className="secondary">
              {t('time.nextYear')}
            </button>
            <PendingTag />
          </div>
          <div className="segmented" role="group" aria-label={t('time.speed')}>
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={speed === value}
                onClick={() => {
                  setSpeed(value);
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </Panel>

        <ArchiveCard
          className="design-archive"
          title={t('creation.heading')}
          number={archiveNumber(archive)}
          labelledBy="design-archive-name"
          guilloche
        >
          <div className="character-head">
            <PixelAvatar age={0} year={1978} variantKey="design-preview|char:protagonist" />
            <div className="character-identity">
              <p className="display-name" id="design-archive-name">
                {t('design.sampleName')}
              </p>
              <p className="eyebrow">
                {t('play.character')} · {session.pack.names[locale]}
              </p>
            </div>
          </div>
          <FieldGrid>
            <Field label={t('play.born')}>{session.birth.birthDate}</Field>
            <Field label={t('play.birthPlace')}>
              {locations ? (
                <span className="meta-value with-flag">
                  <PolityFlag
                    polityId={session.birth.politicalEntityId}
                    date={session.birth.birthDate}
                  />
                  <PlacePolityLabel place={locations.birth.place} polity={locations.birth.polity} />
                </span>
              ) : null}
            </Field>
            <Field label={t('creation.summary.label')}>
              {session.label('settlement', session.birth.settlement, locale)} ·{' '}
              {session.label(
                'familyResources',
                snapshot.actors[0]?.origin.familyResources ?? '',
                locale,
              )}
            </Field>
            <Field label={t('summary.age')} pending />
          </FieldGrid>
          <p className="index-strip">{archiveIndexLine(archive)}</p>
        </ArchiveCard>

        <Panel headingId="design-meters" title={t('design.meters')} aside={t('play.status.aside')}>
          <ul className="meter-list">
            {SAMPLE_METERS.map(([tone, value]) => (
              <Meter
                key={tone}
                tone={tone}
                label={t(`play.status.indicators.${tone}`)}
                value={value}
              />
            ))}
          </ul>
        </Panel>

        <Panel headingId="design-pixel" title={t('design.pixel')}>
          <ul className="stage-list">
            {STAGES.map(([stage, age]) => (
              <li key={stage}>
                <PixelAvatar age={age} year={1950 + age} variantKey={`design|${stage}`} />
                <span>{t(`design.stages.${stage}`)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="design-wide" headingId="design-scenes" title={t('design.scenes')}>
          <div className="scene-pair">
            <PixelScene
              scene="rural-village"
              variantKey="design|rural"
              caption={t('design.scene.rural')}
            />
            <PixelScene
              scene="urban-blocks"
              variantKey="design|urban"
              caption={t('design.scene.urban')}
            />
          </div>
        </Panel>

        <Panel className="design-wide" headingId="design-records" title={t('design.records')}>
          <ol className="record-list">
            <li className="record-row">
              <span className="record-age">1</span>
              <span className="record-text">{t('design.sampleRecord')}</span>
            </li>
            <li className="record-row is-major">
              <span className="record-age">18</span>
              <span className="record-text">{t('design.sampleMajor')}</span>
            </li>
          </ol>
        </Panel>
      </div>
    </div>
  );
}
