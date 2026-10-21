import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { GameSession } from './session.ts';
import type { TimeControl } from './time-control.ts';
import { YearRevealClock, type YearRevealView } from './year-reveal.ts';

/** 订阅模拟更新与动画帧，缓存只读的展示快照，避免在 React 渲染期间修改进度。 */
function revealStore(control: TimeControl, session: GameSession) {
  const clock = new YearRevealClock({
    yearMs: control.speed,
    clock: session.clock,
    factCount: session.facts.length,
  });
  let view = clock.view;
  let observedClock = session.clock;
  let observedFacts = session.facts.length;
  let allowAnimation = true;
  let frameId: number | null = null;
  let previousFrame = 0;
  const listeners = new Set<() => void>();

  const publish = () => {
    view = clock.view;
    for (const listener of listeners) listener();
  };
  const stop = () => {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  };
  const frame = () => {
    frameId = null;
    if (control.state !== 'playing' || !allowAnimation) return;
    const now = performance.now();
    clock.frame(now - previousFrame);
    previousFrame = now;
    publish();
    if (!clock.isComplete) frameId = requestAnimationFrame(frame);
  };
  const start = () => {
    if (
      frameId !== null ||
      clock.isComplete ||
      control.state !== 'playing' ||
      !allowAnimation ||
      listeners.size === 0
    )
      return;
    previousFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  };
  const observe = () => {
    // 暂停/继续/改速度只通知控制状态，没有新模拟数据；此时冻结或恢复原进度。
    // 手动推进或决定真正改变时钟/事实时，交给 observe 一次性显示全部。
    if (session.clock !== observedClock || session.facts.length !== observedFacts) {
      clock.observe({
        clock: session.clock,
        factCount: session.facts.length,
        isPlaying: control.state === 'playing',
        allowAnimation,
      });
      observedClock = session.clock;
      observedFacts = session.facts.length;
    } else if (control.state === 'awaiting-decision' || control.state === 'ended') {
      clock.complete();
    }
    if (control.state !== 'playing') stop();
    publish();
    start();
  };

  return {
    getSnapshot: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      const unsubscribe = control.subscribe(observe);
      start();
      return () => {
        unsubscribe();
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    configure: (yearMs: number, animate: boolean) => {
      clock.setYearMs(yearMs);
      allowAnimation = animate;
      if (!animate) {
        stop();
        clock.complete();
      }
      publish();
      start();
    },
  };
}

export function useYearReveal(options: {
  control: TimeControl;
  session: GameSession;
  yearMs: number;
  allowAnimation: boolean;
}): YearRevealView {
  const { control, session, yearMs, allowAnimation } = options;
  const store = useMemo(() => revealStore(control, session), [control, session]);
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    store.configure(yearMs, allowAnimation);
  }, [store, yearMs, allowAnimation]);
  return view;
}
