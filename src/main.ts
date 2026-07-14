import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';

// Game bootstrap: BattleScene is the only scene (no team-select, no menu — the
// battle starts immediately). Scale.RESIZE is used purely as the viewport
// transport: the canvas fills the #app parent at CSS px == game units (scale 1),
// and BattleScene computes all layout from this.scale.gameSize. No autoCenter,
// roundPixels, or zoom — those would break the game-space == CSS-px invariant
// that keeps pointer coordinates accurate.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [BattleScene],
};

new Phaser.Game(config);
