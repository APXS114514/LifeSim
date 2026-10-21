import { useMemo } from 'react';
import { pixelRuns, type Palette } from '../pixel/sprite.ts';

/**
 * 把调色板索引网格渲染成内联 SVG：同一行连续同色的像素合并为一个矩形，
 * `crispEdges` 保证放大后仍是方格。纯展示，不读写任何模拟状态。
 */
export function PixelArt({
  rows,
  palette,
  title,
  className,
}: {
  rows: readonly string[];
  palette: Palette;
  /** 有文字说明时作为 SVG 标题；没有时整张图对读屏隐藏（旁边必须有文字）。 */
  title?: string | undefined;
  className?: string | undefined;
}) {
  const runs = useMemo(() => pixelRuns(rows), [rows]);
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  return (
    <svg
      className={'pixel-art' + (className ? ' ' + className : '')}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {runs.map((run) => (
        <rect
          key={`${run.y}:${run.x}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={palette[run.key]}
        />
      ))}
    </svg>
  );
}
