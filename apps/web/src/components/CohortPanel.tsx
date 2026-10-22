import { loadRequiredPacks } from '@lifesim/country-packs';
import type { EMPLOYMENT_STATUSES, Locale } from '@lifesim/content-schema';
import { LIFE_NARRATIVE } from '@lifesim/systems';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cohort, describeCohortMember, type CohortView } from '../game/cohort.ts';
import { buildLifeGrid, type GridCategory } from '../game/life-grid.ts';
import { buildSurvivalCurve } from '../game/survival.ts';
import type { GameSession } from '../game/session.ts';

/**
 * 同龄对照（M4-020）：同一秒出生的四个人、生存曲线与人生方格。
 *
 * 三块都是只读的对照信息，全部在本机算：不推进玩家这一局、不写存档、不写偏好、不进时间线。
 * 面板默认折叠，展开时才建 `Cohort` 并一次性推进到玩家时钟，之后只在玩家时钟变化时跟进。
 */

type PanelStatus = 'collapsed' | 'loading' | 'ready' | 'unavailable';

/** 就业状态的显示键与底层契约同一来源。 */
type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** 方格图例的顺序与着色一致。 */
const GRID_CATEGORIES: readonly GridCategory[] = [
  'life',
  'decision',
  'education',
  'career',
  'health',
  'family',
  'history',
  'finance',
  'other',
  'none',
];

const CHART_WIDTH = 320;
const CHART_HEIGHT = 168;
const CHART_LEFT = 34;
const CHART_RIGHT = 8;
const CHART_TOP = 10;
const CHART_BOTTOM = 24;
const MAX_AGE = 100;
const AXIS_AGES: readonly number[] = [0, 20, 40, 60, 80, 100];
const AXIS_SHARES: readonly number[] = [1, 0.5, 0];

function chartX(age: number): number {
  const width = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  return CHART_LEFT + (age / MAX_AGE) * width;
}

function chartY(survived: number): number {
  const height = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  return CHART_TOP + (1 - survived) * height;
}

export function CohortPanel({ session, locale }: { session: GameSession; locale: Locale }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PanelStatus>('collapsed');
  const [cohort, setCohort] = useState<Cohort | null>(null);

  const clock = session.clock;
  const seed = session.request.seed;
  const birthDate = session.birth.birthDate;
  const packId = session.birth.packId;
  const region = session.region;
  const facts = session.facts;
  const birthYear = Number(birthDate.slice(0, 4));
  const currentYear = Number(clock.slice(0, 4));
  const seriesEndYear = region.evidence.mortality.yearRange[1];

  /** 展开那一刻才加载所需的国别数据并建出四个人；折叠时不创建。 */
  function expand(): void {
    setOpen(true);
    if (cohort !== null || status === 'loading') return;
    setStatus('loading');
    // 四人的地区按出生年的五地出生人数加权抽取，需要五个国家包的数据（数据在本机，不访问服务器）。
    void loadRequiredPacks('random')
      .then(() => {
        const created = new Cohort({ seed, birthDate });
        created.advanceTo(clock);
        setCohort(created);
        setStatus('ready');
      })
      .catch(() => {
        setStatus('unavailable');
      });
  }

  // 每次渲染都把四个人补到玩家时钟；已到达或玩家时钟后退时是幂等空操作，所以不触发额外渲染。
  const views = useMemo(() => {
    if (cohort === null) return [];
    cohort.advanceTo(clock);
    return cohort.members.map((member) => describeCohortMember(member, clock, packId));
  }, [cohort, clock, packId]);

  // 折叠时不读快照；展开后按权威时钟取去世年份（尚在世为 null）。
  let deathYear: number | null = null;
  if (open) {
    const snapshot = session.simulation.snapshot();
    const protagonist = snapshot.actors.find((actor) => actor.id === snapshot.activeCharacterId);
    if (protagonist?.vitalStatus.kind === 'deceased') {
      deathYear = Number(protagonist.vitalStatus.deathDate.slice(0, 4));
    }
  }

  const grid = useMemo(
    () => (open ? buildLifeGrid({ birthYear, deathYear, currentYear, facts }) : []),
    [open, birthYear, deathYear, currentYear, facts],
  );

  const curve = useMemo(
    () =>
      open
        ? buildSurvivalCurve({
            birthYear,
            packId,
            seriesEndYear,
            lookup: (year, age) => {
              const value = region.tables.ageValue('life-table-qx', year, age);
              return value === null
                ? null
                : { value: value.value, grade: value.grade, projected: value.projected };
            },
          })
        : null,
    [open, birthYear, packId, region, seriesEndYear],
  );

  const packName = session.pack.names[locale];
  const employmentLabel = (statusKey: string) =>
    t(`cohort.employment.${statusKey as EmploymentStatus}`);
  const educationLabel = (level: CohortView['education']) =>
    LIFE_NARRATIVE[locale].enums.level[level];

  return (
    <section className="panel cohort-panel" aria-labelledby="cohort-heading">
      <div className="panel-head">
        <h2 id="cohort-heading">
          <button
            type="button"
            className="cohort-toggle"
            aria-expanded={open}
            onClick={() => {
              if (open) setOpen(false);
              else expand();
            }}
          >
            <span className="cohort-toggle-mark" aria-hidden="true">
              {open ? '−' : '+'}
            </span>
            {t('cohort.heading')}
          </button>
        </h2>
        <span className="panel-aside">{t('cohort.assumption')}</span>
      </div>
      {open && (
        <div className="panel-body">
          {status === 'unavailable' && <p className="hint">{t('cohort.unavailable')}</p>}
          {status !== 'unavailable' && (
            <>
              <section className="cohort-section" aria-labelledby="cohort-four-heading">
                <h3 id="cohort-four-heading">{t('cohort.four.heading')}</h3>
                {status === 'loading' ? (
                  <p className="hint" role="status">
                    {t('cohort.loading')}
                  </p>
                ) : (
                  <ol className="cohort-list">
                    {views.map((view) => {
                      const member = cohort?.members[view.index - 1];
                      return (
                        <li className="cohort-row" key={view.index}>
                          <span className="cohort-place">
                            {member ? member.pack.names[locale] : ''}
                          </span>
                          <span className="cohort-status">
                            {view.alive ? t('cohort.four.alive') : t('cohort.four.deceased')}
                          </span>
                          <span className="cohort-age-cell">
                            <span className="cohort-age">
                              {view.alive
                                ? String(view.age)
                                : t('cohort.four.diedAt', { age: view.age })}
                            </span>
                            {view.alive && (
                              <span className="cohort-age-unit">{t('cohort.ageUnit')}</span>
                            )}
                          </span>
                          <span className="cohort-education">{educationLabel(view.education)}</span>
                          <span className="cohort-employment">
                            {employmentLabel(view.employment)}
                          </span>
                          <span className="cohort-chronic">
                            {view.chronicConditions === 0
                              ? t('cohort.four.chronicNone')
                              : t('cohort.four.chronicCount', { count: view.chronicConditions })}
                          </span>
                          {view.sameCountryAsPlayer && (
                            <span className="cohort-same-country">
                              {t('cohort.four.sameCountry')}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
                <p className="hint">{t('cohort.four.disclosure')}</p>
              </section>

              <section className="cohort-section" aria-labelledby="cohort-survival-heading">
                <h3 id="cohort-survival-heading">{t('cohort.survival.heading')}</h3>
                {curve && (
                  <svg
                    className="survival-chart"
                    role="img"
                    viewBox={'0 0 ' + String(CHART_WIDTH) + ' ' + String(CHART_HEIGHT)}
                    aria-labelledby="cohort-survival-title"
                  >
                    <title id="cohort-survival-title">
                      {t('cohort.survival.title', { year: birthYear, pack: packName })}
                    </title>
                    {AXIS_SHARES.map((share) => (
                      <g key={'share-' + String(share)}>
                        <line
                          className="survival-grid-line"
                          x1={CHART_LEFT}
                          x2={CHART_WIDTH - CHART_RIGHT}
                          y1={chartY(share)}
                          y2={chartY(share)}
                        />
                        <text
                          className="survival-axis"
                          x={CHART_LEFT - 4}
                          y={chartY(share) + 3}
                          textAnchor="end"
                        >
                          {String(Math.round(share * 100))}%
                        </text>
                      </g>
                    ))}
                    {AXIS_AGES.map((age) => (
                      <text
                        className="survival-axis"
                        key={'age-' + String(age)}
                        x={chartX(age)}
                        y={CHART_HEIGHT - 6}
                        textAnchor="middle"
                      >
                        {String(age)}
                      </text>
                    ))}
                    <polyline
                      className="survival-line"
                      points={curve.points
                        .map((point) => chartX(point.age) + ',' + chartY(point.survived))
                        .join(' ')}
                    />
                  </svg>
                )}
                <p className="hint">{t('cohort.survival.disclosure')}</p>
              </section>

              <section className="cohort-section" aria-labelledby="cohort-grid-heading">
                <h3 id="cohort-grid-heading">{t('cohort.grid.heading')}</h3>
                <ol className="life-grid">
                  {grid.map((cell) => (
                    <li
                      className="grid-cell"
                      key={cell.year}
                      data-category={cell.category}
                      title={cell.year + ' · ' + t(`cohort.grid.${cell.category}`)}
                      aria-label={cell.year + ' · ' + t(`cohort.grid.${cell.category}`)}
                    />
                  ))}
                </ol>
                <ul className="grid-legend">
                  {GRID_CATEGORIES.map((category) => (
                    <li className="grid-legend-item" key={category} data-category={category}>
                      <span className="grid-swatch" aria-hidden="true" />
                      {t(`cohort.grid.${category}`)}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </section>
  );
}
