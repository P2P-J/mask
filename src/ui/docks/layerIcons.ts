// 18px 라인 아이콘(currentColor). 레이어 id → inline SVG.
export const LAYER_ICONS: Record<string, string> = {
  smoothing: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><circle cx="18" cy="17" r="1.6"/></svg>`,
  color: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none"/></svg>`,
  teeth: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h14v5c0 3-1 7-3 7s-2-3-4-3-2 3-4 3-3-4-3-7z"/></svg>`,
  eyeDetail: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  makeup: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="7" rx="2"/><path d="M10 10v9a2 2 0 002 2 2 2 0 002-2v-9"/></svg>`,
  reshape: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c4 0 7 3 7 8 0 6-4 10-7 10S5 17 5 11c0-5 3-8 7-8z"/></svg>`,
  filter: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2"/></svg>`,
  background: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M5 17l5-4 4 3 2-2 3 3"/></svg>`,
};

// 레이어 그룹(렌더 순서). 각 그룹 안의 id 순서도 유지.
export const LAYER_GROUPS: { title: string; ids: string[] }[] = [
  { title: "피부·톤", ids: ["smoothing", "color"] },
  { title: "디테일", ids: ["teeth", "eyeDetail"] },
  { title: "메이크업", ids: ["makeup"] },
  { title: "윤곽", ids: ["reshape"] },
  { title: "마무리", ids: ["filter", "background"] },
];
