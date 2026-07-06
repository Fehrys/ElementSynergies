import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';

// Game bootstrap: a single fixed-size canvas with BattleScene as the only
// scene (no team-select, no menu — the battle starts immediately).
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 480,
  height: 720,
  backgroundColor: '#1b1b2f',
  parent: 'app',
  scene: [BattleScene],
};

new Phaser.Game(config);
