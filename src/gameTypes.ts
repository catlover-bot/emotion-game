// src/gameTypes.ts

export type Bomb = {
  x: number;
  y: number;
  vx: number;
  radius: number;
  alive: boolean;
};

export type Star = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alive: boolean;
};

export type Wave = {
  x: number;
  y: number;
  vx: number;
  radius: number;
  alive: boolean;
};

export type PublicState = {
  score: number;
  maxCombo: number;
  feverCount: number;
};

export type Mission = {
  text: string;
  condition: (state: PublicState) => boolean;
};

// 「バズったときの いいねシャワー」用パーティクル
export type LikeParticle = {
  x: number;
  y: number;
  vy: number;
  alpha: number;
  scale: number;
  alive: boolean;
};
