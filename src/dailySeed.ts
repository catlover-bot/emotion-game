// src/dailySeed.ts
export function dailySeed(): number {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = (h ^ key.charCodeAt(i)) * 16777619;
  return h >>> 0;
}
