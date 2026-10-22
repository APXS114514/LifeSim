import { loadRequiredPacks } from '@lifesim/country-packs';
import type { EMPLOYMENT_STATUSES, ISODate, Locale } from '@lifesim/content-schema';
import { LIFE_NARRATIVE } from '@lifesim/systems';
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cohort,
  advanceCohortStep,
  describeCohortMember,
  isCohortStepEnough,
  needsCohortAdvance,
  type CohortView,
} from '../game/cohort.ts';
import { buildLifeGrid, GRID_CATEGORIES, revealedGridInput } from '../game/life-grid.ts';
import { takeQaFault, type QaFault } from '../game/qa-faults.ts';
import {
  buildSurvivalCurve,
  survivalChartSegments,
  type SurvivalCurve,
  type SurvivalPoint,
} from '../game/survival.ts';
import type { GameSession } from '../game/session.ts';

/**
 * 同龄对照（M4-020 / M4-020c）：同一秒出生的四个人、生存曲线与人生方格。
 *
 * 三块都是只读的对照信息，全部在本机算：不推进玩家这一局、不写存档、不写偏好、不进时间线。
 * 面板默认折叠，展开时才加载五个国家包并建 `Cohort`；追赶按年分片到动画帧，主线程不会一次算完
 * 几十年。整块面板有自己的错误边界：四个人或曲线算不出来只替换这一块，玩家这一局照常可玩。
 */

type PanelPhase = 'collapsed' | 'loading' | 'catching-up' | 'ready' | 'offline' | 'failed';

type FailureKind = 'offline' | 'calculation';

/** 就业状态的显示键与底层契约同一来源。 */
type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

const CHART_WIDTH = 340;
const CHART_HEIGHT = 200;
const CHART_LEFT = 46;
const CHART_RIGHT = 12;
const CHART_TOP = 12;
const CHART_BOTTOM = 44;
const MAX_AGE = 100;
const AXIS_AGES: readonly number[] = [0, 20, 40, 60, 80, 100];
const AXIS_SHARES: readonly number[] = [1, 0.5, 0];
const CREATE_MEASURE = 'lifesim:cohort:create';
const ADVANCE_MEASURE = 'lifesim:cohort:advance';

function chartX(age: number): number {
  const width = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  return CHART_LEFT + (age / MAX_AGE) * width;
}

function chartY(survived: number): number {
  const height = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  return CHART_TOP + (1 - survived) * height;
}

function shareText(survived: number): string {
  return (survived * 100).toFixed(1) + '%';
}

/** 记录一次同步计算的长度，供浏览器性能面板与端到端性能检查读取。 */
function measureStep<T>(name: string, action: () => T): T {
  if (typeof performance === 'undefined') return action();
  const start = name + ':start';
  const end = name + ':end';
  performance.mark(start);
  try {
    return action();
  } finally {
    performance.mark(end);
    performance.measure(name, start, end);
    performance.clearMarks(start);
    performance.clearMarks(end);
  }
}

/**
 * 只包住面板正文的错误边界。四个人或曲线在渲染期抛错时，React 卸载的是这一块，
 * 标题、折叠按钮与玩家这一局都不受影响；「重试」由父组件重置后清除。
 */
class CohortErrorBoundary extends Component<
  { readonly resetKey: number; readonly fallback: ReactNode; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  constructor(props: {
    readonly resetKey: number;
    readonly fallback: ReactNode;
    readonly children: ReactNode;
  }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 保留诊断信息；玩家的页面不因此变成白屏。
    console.error('Cohort panel render failed', error, info.componentStack);
  }

  override componentDidUpdate(previous: {
    readonly resetKey: number;
    readonly fallback: ReactNode;
    readonly children: ReactNode;
  }): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 「需要联网」与「计算出错」共用外观，但文案、原因和可做的事不同。 */
function CohortFailure({ kind, onRetry }: { kind: FailureKind; onRetry: () => void }) {
  const { t } = useTranslation();
  const heading = kind === 'offline' ? t('cohort.offline.heading') : t('cohort.failed.heading');
  const detail = kind === 'offline' ? t('cohort.offline.detail') : t('cohort.failed.detail');
  return (
    <div className="cohort-failure" role="alert" data-failure={kind}>
      <h3>{heading}</h3>
      <p>{detail}</p>
      <button type="button" className="secondary" onClick={onRetry}>
        {t('cohort.retry')}
      </button>
    </div>
  );
}

/** 测试注入的渲染错误。只在全局诊断键存在时挂载。 */
function RenderFaultBomb(): never {
  throw new Error('Injected cohort render failure (QA)');
}

export function CohortPanel({
  session,
  locale,
  visibleCount,
  revealDate,
}: {
  session: GameSession;
  locale: Locale;
  /** 时间线当前已揭示的事实条数；方格与四人都不能越过它。 */
  visibleCount: number;
  /** 年进度条显示的日期（≤ 权威时钟）；四人推进与方格年份都以它为准。 */
  revealDate: ISODate;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<PanelPhase>('collapsed');
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [, bumpRevision] = useReducer((value: number) => value + 1, 0);
  const [attempt, setAttempt] = useState(0);
  const [qaFault, setQaFault] = useState<QaFault | null>(null);
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef(revealDate);
  const seed = session.request.seed;
  const birthDate = session.birth.birthDate;

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const startPump = useCallback(
    (created: Cohort) => {
      cancelFrame();
      const step = () => {
        frameRef.current = null;
        try {
          const target = targetRef.current;
          const behind = measureStep(ADVANCE_MEASURE, () => {
            let pending = false;
            // 一帧只把每个人推进一年：实测四人一年远低于 16 ms，几十年也不会卡住主线程。
            for (const member of created.members) {
              if (advanceCohortStep(member, target)) pending = true;
            }
            return pending;
          });
          bumpRevision();
          if (behind) {
            frameRef.current = requestAnimationFrame(step);
          } else {
            setPhase('ready');
          }
        } catch {
          setPhase('failed');
        }
      };
      // 状态更新放到帧回调里：effect 主体只负责安排下一帧，不直接级联渲染。
      frameRef.current = requestAnimationFrame(() => {
        setPhase('catching-up');
        step();
      });
    },
    [cancelFrame],
  );

  const begin = useCallback(() => {
    cancelFrame();
    setCohort(null);
    setQaFault(null);
    setPhase('loading');
    if (typeof performance !== 'undefined') {
      performance.clearMeasures(CREATE_MEASURE);
      performance.clearMeasures(ADVANCE_MEASURE);
    }
    const fault = takeQaFault();
    let packsLoaded = false;
    void loadRequiredPacks('random')
      .then(() => {
        packsLoaded = true;
        const created = measureStep(CREATE_MEASURE, () => new Cohort({ seed, birthDate }));
        if (fault?.kind === 'cohort-calculation') {
          throw new Error('Injected cohort calculation failure (QA)');
        }
        setQaFault(fault);
        setCohort(created);
        bumpRevision();
        startPump(created);
      })
      .catch(() => {
        // 数据还没到就是「需要联网下载国家数据」；数据到了以后才失败的就是「计算出错」。
        setPhase(packsLoaded ? 'failed' : 'offline');
      });
  }, [birthDate, cancelFrame, seed, startPump]);

  /** 展开；已经有可用数据时由下面的 effect 继续追赶，不重建四个人。 */
  const expand = useCallback(() => {
    setOpen(true);
    if (cohort !== null) {
      if (phase === 'offline' || phase === 'failed') {
        begin();
      } else if (!cohort.members.some((member) => needsCohortAdvance(member, revealDate))) {
        // 折叠时如果刚好追完了最后一帧，重新展开不该永久停在「正在追赶」。
        setPhase('ready');
      }
      return;
    }
    if (phase === 'loading') return;
    begin();
  }, [begin, cohort, phase, revealDate]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
    begin();
  }, [begin]);

  // 揭示日期是四个人的目标时钟；播放动画时它每帧都会变，追赶循环始终读最新值。
  useEffect(() => {
    targetRef.current = revealDate;
  }, [revealDate]);

  // 折叠时停掉帧循环；重新展开或时钟前进时再接着算。
  useEffect(() => {
    if (!open) {
      cancelFrame();
      return;
    }
    if (cohort === null) return;
    if (phase !== 'ready' && phase !== 'catching-up') return;
    if (!cohort.members.some((member) => needsCohortAdvance(member, revealDate))) {
      return;
    }
    startPump(cohort);
  }, [cancelFrame, cohort, open, phase, revealDate, startPump]);

  useEffect(() => cancelFrame, [cancelFrame]);

  const status: PanelPhase = open ? phase : 'collapsed';

  return (
    <section className="panel cohort-panel" aria-labelledby="cohort-heading" data-status={status}>
      <div className="panel-head">
        <h2 id="cohort-heading">
          <button
            type="button"
            className="cohort-toggle"
            aria-expanded={open}
            onClick={() => {
              if (open) {
                setOpen(false);
                cancelFrame();
              } else {
                expand();
              }
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
        <CohortErrorBoundary
          resetKey={attempt}
          fallback={<CohortFailure kind="calculation" onRetry={retry} />}
        >
          <div className="panel-body">
            {phase === 'offline' ? (
              <CohortFailure kind="offline" onRetry={retry} />
            ) : phase === 'failed' ? (
              <CohortFailure kind="calculation" onRetry={retry} />
            ) : (
              <CohortContent
                session={session}
                locale={locale}
                cohort={cohort}
                phase={phase}
                revealDate={revealDate}
                visibleCount={visibleCount}
                qaFault={qaFault}
              />
            )}
          </div>
        </CohortErrorBoundary>
      )}
    </section>
  );
}

/** 面板正文单独成一个组件：它渲染时抛的错才会被外面的错误边界接住。 */
function CohortContent({
  session,
  locale,
  cohort,
  phase,
  revealDate,
  visibleCount,
  qaFault,
}: {
  session: GameSession;
  locale: Locale;
  cohort: Cohort | null;
  phase: PanelPhase;
  revealDate: ISODate;
  visibleCount: number;
  qaFault: QaFault | null;
}) {
  const { t } = useTranslation();
  const packId = session.birth.packId;
  const birthYear = Number(session.birth.birthDate.slice(0, 4));
  const region = session.region;
  const seriesEndYear = region.evidence.mortality.yearRange[1];
  const packName = session.pack.names[locale];

  // 每次分片推进都会让父组件重绘，这里重新读取四个人的状态；describe 是纯函数，不重新模拟。
  // 只差一步（通常就是「下一年」）时在本帧同步走完，面板不会比玩家的时钟慢一帧；
  // 一次跨很多年的追赶仍由父组件的分片循环负责。日期未变时这些调用是幂等空操作。
  const behind =
    cohort === null
      ? []
      : cohort.members.filter((member) => needsCohortAdvance(member, revealDate));
  if (behind.length > 0 && behind.every((member) => isCohortStepEnough(member, revealDate))) {
    for (const member of behind) advanceCohortStep(member, revealDate);
  }
  const views =
    cohort === null
      ? []
      : cohort.members.map((member) => describeCohortMember(member, revealDate, packId));

  // 方格只读时间线已经揭示的事实；去世格也要等死亡事实揭示后才出现。
  const revealed = useMemo(
    () => revealedGridInput({ facts: session.facts, visibleCount, revealDate }),
    [session.facts, visibleCount, revealDate],
  );

  const grid = useMemo(
    () =>
      buildLifeGrid({
        birthYear,
        deathYear: revealed.deathYear,
        currentYear: revealed.currentYear,
        facts: revealed.facts,
      }),
    [birthYear, revealed],
  );

  const gapFrom = qaFault?.kind === 'survival-gap' ? qaFault.fromAge : null;
  const curve = useMemo(
    () =>
      buildSurvivalCurve({
        birthYear,
        packId,
        seriesEndYear,
        lookup: (year, age) => {
          if (gapFrom !== null && age >= gapFrom) return null;
          const value = region.tables.ageValue('life-table-qx', year, age);
          return value === null
            ? null
            : { value: value.value, grade: value.grade, projected: value.projected };
        },
      }),
    [birthYear, gapFrom, packId, region, seriesEndYear],
  );

  const employmentLabel = (statusKey: string) =>
    t(`cohort.employment.${statusKey as EmploymentStatus}`);
  const educationLabel = (level: CohortView['education']) =>
    LIFE_NARRATIVE[locale].enums.level[level];

  return (
    <>
      <section className="cohort-section" aria-labelledby="cohort-four-heading">
        <h3 id="cohort-four-heading">{t('cohort.four.heading')}</h3>
        {cohort === null ? (
          <p className="hint" role="status">
            {t('cohort.loading')}
          </p>
        ) : (
          <>
            {phase === 'catching-up' && (
              <p className="cohort-catching-up" role="status">
                {t('cohort.catchingUp')}
              </p>
            )}
            <ol className="cohort-list">
              {views.map((view) => {
                const member = cohort.members[view.index - 1];
                return (
                  <li className="cohort-row" key={view.index}>
                    <span className="cohort-place">{member ? member.pack.names[locale] : ''}</span>
                    <span className="cohort-status">
                      {view.alive ? t('cohort.four.alive') : t('cohort.four.deceased')}
                    </span>
                    <span className="cohort-age-cell">
                      <span className="cohort-age">
                        {view.alive ? String(view.age) : t('cohort.four.diedAt', { age: view.age })}
                      </span>
                      {view.alive && <span className="cohort-age-unit">{t('cohort.ageUnit')}</span>}
                    </span>
                    <span className="cohort-education">{educationLabel(view.education)}</span>
                    <span className="cohort-employment">{employmentLabel(view.employment)}</span>
                    <span className="cohort-chronic">
                      {view.chronicConditions === 0
                        ? t('cohort.four.chronicNone')
                        : t('cohort.four.chronicCount', { count: view.chronicConditions })}
                    </span>
                    {view.sameCountryAsPlayer && (
                      <span className="cohort-same-country">{t('cohort.four.sameCountry')}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
        <p className="hint">{t('cohort.four.disclosure')}</p>
      </section>

      <SurvivalSection curve={curve} birthYear={birthYear} packName={packName} locale={locale} />

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

      {qaFault?.kind === 'cohort-render' && <RenderFaultBomb />}
    </>
  );
}

function SurvivalSection({
  curve,
  birthYear,
  packName,
  locale,
}: {
  curve: SurvivalCurve;
  birthYear: number;
  packName: string;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const segments = survivalChartSegments(curve);
  const last = curve.points[curve.points.length - 1] ?? null;
  const scenarioText =
    curve.scenarioFrom === null
      ? null
      : t('cohort.survival.scenarioFrom', { age: curve.scenarioFrom });
  const missingText =
    curve.truncatedAt === null
      ? null
      : t('cohort.survival.dataMissing', { age: curve.truncatedAt });

  // 数据表与读屏说明都取每十年一个点，再补上情景起点与最后一个点。
  const samples = useMemo(() => {
    const chosen: SurvivalPoint[] = curve.points.filter((point) => point.age % 10 === 0);
    const scenario =
      curve.scenarioFrom === null
        ? undefined
        : curve.points.find((point) => point.age === curve.scenarioFrom);
    if (scenario && !chosen.some((point) => point.age === scenario.age)) chosen.push(scenario);
    if (last && !chosen.some((point) => point.age === last.age)) chosen.push(last);
    return chosen.sort((a, b) => a.age - b.age);
  }, [curve, last]);

  const separator = locale === 'en' ? '; ' : '；';
  const srPoints = samples
    .map((point) =>
      t('cohort.survival.srPoint', { age: point.age, share: shareText(point.survived) }),
    )
    .join(separator);
  const srText = [srPoints, scenarioText, missingText].filter((value) => value !== null).join(' ');
  const missingPoint = segments.missingPoint;
  const nearRight = missingPoint !== null && chartX(missingPoint.age) > CHART_WIDTH - 64;
  const missingLabelX = missingPoint === null ? 0 : chartX(missingPoint.age) + (nearRight ? -6 : 6);
  const missingLabelAnchor = nearRight ? 'end' : 'start';

  return (
    <section className="cohort-section" aria-labelledby="cohort-survival-heading">
      <h3 id="cohort-survival-heading">{t('cohort.survival.heading')}</h3>
      <svg
        className="survival-chart"
        role="img"
        viewBox={'0 0 ' + String(CHART_WIDTH) + ' ' + String(CHART_HEIGHT)}
        aria-labelledby="cohort-survival-title"
        aria-describedby="cohort-survival-desc"
      >
        <title id="cohort-survival-title">
          {t('cohort.survival.title', { year: birthYear, pack: packName })}
        </title>
        <desc id="cohort-survival-desc">{srText}</desc>
        <g aria-hidden="true">
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
                x={CHART_LEFT - 6}
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
              y={CHART_HEIGHT - 28}
              textAnchor="middle"
            >
              {String(age)}
            </text>
          ))}
          <text
            className="survival-axis-title"
            x={(CHART_LEFT + CHART_WIDTH - CHART_RIGHT) / 2}
            y={CHART_HEIGHT - 8}
            textAnchor="middle"
          >
            {t('cohort.survival.axisAge')}
          </text>
          <text
            className="survival-axis-title"
            x={12}
            y={(CHART_TOP + CHART_HEIGHT - CHART_BOTTOM) / 2}
            textAnchor="middle"
            transform={
              'rotate(-90 12 ' + String((CHART_TOP + CHART_HEIGHT - CHART_BOTTOM) / 2) + ')'
            }
          >
            {t('cohort.survival.axisShare')}
          </text>
          {curve.scenarioFrom !== null && (
            <>
              <line
                className="survival-scenario-divider"
                x1={chartX(curve.scenarioFrom)}
                x2={chartX(curve.scenarioFrom)}
                y1={CHART_TOP}
                y2={CHART_HEIGHT - CHART_BOTTOM}
              />
              <text
                className="survival-scenario-tag"
                x={chartX(curve.scenarioFrom) + 3}
                y={CHART_TOP + 9}
              >
                {t('cohort.survival.scenarioTag')}
              </text>
            </>
          )}
          {segments.observed.length > 1 && (
            <polyline
              className="survival-line"
              points={segments.observed
                .map((point) => chartX(point.age) + ',' + chartY(point.survived))
                .join(' ')}
            />
          )}
          {segments.scenario.length > 1 && (
            <polyline
              className="survival-line survival-line--scenario"
              points={segments.scenario
                .map((point) => chartX(point.age) + ',' + chartY(point.survived))
                .join(' ')}
            />
          )}
          {missingPoint !== null && (
            <>
              <circle
                className="survival-missing-dot"
                cx={chartX(missingPoint.age)}
                cy={chartY(missingPoint.survived)}
                r={3}
              />
              <text
                className="survival-missing-label"
                x={missingLabelX}
                y={chartY(missingPoint.survived) + 4}
                textAnchor={missingLabelAnchor}
              >
                {t('cohort.survival.dataMissingShort')}
              </text>
            </>
          )}
        </g>
      </svg>

      <ul className="survival-legend">
        <li>
          <span className="survival-swatch survival-swatch--observed" aria-hidden="true" />
          {t('cohort.survival.legendPeriod')}
        </li>
        {curve.scenarioFrom !== null && (
          <li>
            <span className="survival-swatch survival-swatch--scenario" aria-hidden="true" />
            {t('cohort.survival.legendScenario')}
          </li>
        )}
        {curve.truncatedAt !== null && (
          <li>
            <span className="survival-swatch survival-swatch--missing" aria-hidden="true" />
            {t('cohort.survival.dataMissingShort')}
          </li>
        )}
      </ul>

      {scenarioText !== null && <p className="hint survival-scenario">{scenarioText}</p>}
      {missingText !== null && (
        <p className="hint survival-missing" role="status">
          {missingText}
        </p>
      )}

      <details className="survival-data">
        <summary>{t('cohort.survival.tableSummary')}</summary>
        <table>
          <caption className="visually-hidden">
            {t('cohort.survival.title', { year: birthYear, pack: packName })}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('cohort.survival.tableAge')}</th>
              <th scope="col">{t('cohort.survival.tableShare')}</th>
              <th scope="col">{t('cohort.survival.tableSource')}</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((point) => (
              <tr key={point.age}>
                <td>{point.age}</td>
                <td>{shareText(point.survived)}</td>
                <td>
                  {point.method === 'scenario-hold-last'
                    ? t('cohort.survival.sourceScenario')
                    : t('cohort.survival.sourcePeriod')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <p className="hint">{t('cohort.survival.disclosure')}</p>
    </section>
  );
}
