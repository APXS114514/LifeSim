/** 「地点 + 政体」的两行标签：长名称在列表/卡片/面板里共用同一套换行规则。 */
export function PlacePolityLabel({ place, polity }: { place: string; polity: string }) {
  return (
    <span className="place-label">
      <span className="place-name">{place}</span>
      {polity ? <span className="place-polity">{polity}</span> : null}
    </span>
  );
}
