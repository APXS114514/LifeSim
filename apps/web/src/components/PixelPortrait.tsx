import { useMemo } from 'react';
import { composeAvatar, lifeStageFor } from '../pixel/avatar.ts';
import { composeScene, type SceneId } from '../pixel/scene.ts';
import { variantHash } from '../pixel/sprite.ts';
import { PixelArt } from './PixelArt.tsx';

/** 像素头像：人生阶段来自年龄，服装色调来自画面年份，变体来自种子与角色 ID 的散列。 */
export function PixelAvatar({
  age,
  year,
  variantKey,
  title,
}: {
  age: number;
  year: number;
  variantKey: string;
  title?: string | undefined;
}) {
  const stage = lifeStageFor(age);
  const image = useMemo(
    () => composeAvatar({ stage, year, variant: variantHash(variantKey) }),
    [stage, year, variantKey],
  );
  return (
    <div className="avatar-tile">
      <PixelArt rows={image.rows} palette={image.palette} title={title} />
    </div>
  );
}

/** 像素场景：场景目录与变体都是确定性的；说明文字由调用方给出。 */
export function PixelScene({
  scene,
  variantKey,
  caption,
}: {
  scene: SceneId;
  variantKey: string;
  caption?: string | undefined;
}) {
  const image = useMemo(() => composeScene(scene, variantHash(variantKey)), [scene, variantKey]);
  return (
    <figure className="pixel-frame scene-frame">
      <PixelArt rows={image.rows} palette={image.palette} />
      {caption ? <figcaption className="scene-caption">{caption}</figcaption> : null}
    </figure>
  );
}
