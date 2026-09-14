import Phaser from 'phaser';
import './style.css';
import { PLAYER_REACTION, createPlayerState, canPlayerAct, applyPlayerHit, advancePlayerState } from './player-state.js';

const WIDTH = 960;
const HEIGHT = 540;
const WORLD_WIDTH = 3600;
const FLOOR_TOP = 315;
const FLOOR_BOTTOM = 500;
const COMBO_WINDOW = 520;
const RAGE_DURATION = 10000;
const PLAYER_FRAME_SIZE = 256;
const PLAYER_SCALE = 0.45;
const PLAYER_SPEED = 150;

const ENCOUNTERS = [
  {
    id: 'deck-a',
    name: '甲板前段',
    triggerX: 880,
    cameraX: 560,
    waves: [
      [
        { x: 1010, y: 350 },
        { x: 1160, y: 430 },
        { x: 1320, y: 370 },
      ],
      [
        { x: 930, y: 450 },
        { x: 1110, y: 335 },
        { x: 1280, y: 455 },
        { x: 1410, y: 365 },
      ],
    ],
  },
  {
    id: 'deck-b',
    name: '主桅附近',
    triggerX: 1900,
    cameraX: 1570,
    waves: [
      [
        { x: 1760, y: 350 },
        { x: 1920, y: 445 },
        { x: 2100, y: 365 },
        { x: 2250, y: 440 },
      ],
      [
        { x: 1690, y: 410 },
        { x: 1840, y: 335 },
        { x: 1990, y: 455 },
        { x: 2160, y: 350 },
        { x: 2370, y: 420 },
      ],
    ],
  },
  {
    id: 'deck-c',
    name: '船首通道',
    triggerX: 2840,
    cameraX: 2510,
    waves: [
      [
        { x: 2670, y: 345 },
        { x: 2820, y: 455 },
        { x: 3000, y: 365 },
        { x: 3170, y: 435 },
      ],
      [
        { x: 2610, y: 420 },
        { x: 2760, y: 345 },
        { x: 2920, y: 455 },
        { x: 3080, y: 340 },
        { x: 3250, y: 430 },
        { x: 3370, y: 375 },
      ],
    ],
  },
];

class PrototypeScene extends Phaser.Scene {
  constructor() {
    super('PrototypeScene');
  }

  init() {
    this.playerState = createPlayerState();
    this.pendingWaveSpawns = 0;
    this.enemies = [];
    this.attackCooldown = 0;
    this.comboCount = 0;
    this.comboExpireAt = 0;
    this.lastHorizontalTap = { left: -9999, right: -9999 };
    this.isDashing = false;
    this.dashUntil = 0;
    this.rage = 0;
    this.rageUntil = 0;
    this.gameOver = false;
    this.grabbedEnemy = null;
    this.grabPunchCount = 0;
    this.playerAttackAnimationUntil = 0;

    this.encounters = ENCOUNTERS.map((item) => ({ ...item, cleared: false }));
    this.activeEncounter = null;
    this.currentWaveIndex = -1;
    this.waveTransitionPending = false;
    this.stageComplete = false;
    this.lockLeft = 0;
    this.lockRight = WORLD_WIDTH;
    this.leftBarrier = null;
    this.rightBarrier = null;
  }

  preload() {
    this.load.spritesheet('bii-idle', '/characters/bii/idle.png', {
      frameWidth: PLAYER_FRAME_SIZE,
      frameHeight: PLAYER_FRAME_SIZE,
    });

    this.load.spritesheet('bii-walk', '/characters/bii/walk.png', {
      frameWidth: PLAYER_FRAME_SIZE,
      frameHeight: PLAYER_FRAME_SIZE,
    });

    this.load.spritesheet('bii-punch', '/characters/bii/punch.png', {
      frameWidth: PLAYER_FRAME_SIZE,
      frameHeight: PLAYER_FRAME_SIZE,
    });
  }

  create() {
    this.physics.world.resume();
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, HEIGHT);
    this.cameras.main.setBackgroundColor('#75b7db');

    this.makeTextures();
    this.createPlayerAnimations();
    this.createDeckStage();
    this.createUi();

    const hasPlayerArt = this.textures.exists('bii-idle');
    this.player = this.physics.add.sprite(220, 400, hasPlayerArt ? 'bii-idle' : 'bii', 0);
    this.player.usesSpriteArt = hasPlayerArt;

    if (hasPlayerArt) {
      this.player.setScale(PLAYER_SCALE);
      this.player.body.setSize(92, 150);
      this.player.body.setOffset(82, 84);
      if (this.anims.exists('bii-idle')) this.player.play('bii-idle');
    } else {
      this.player.body.setSize(52, 72);
    }

    this.player.setCollideWorldBounds(true);
    this.player.baseSpeed = PLAYER_SPEED;
    this.player.facing = 1;
    this.player.hp = 10;
    this.player.maxHp = 10;
    this.player.setDepth(this.player.y);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,J,K,L,SPACE,R');

    this.bindDashInputs();

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1, -120, 0);
    this.cameras.main.setDeadzone(360, 160);

    this.showCenterMessage('格兰赛法甲板', '向右前进，击退来袭的骑空士！', 1700);
  }

  createPlayerAnimations() {
    if (this.textures.exists('bii-idle') && !this.anims.exists('bii-idle')) {
      this.anims.create({
        key: 'bii-idle',
        frames: this.anims.generateFrameNumbers('bii-idle', { start: 0, end: 3 }),
        frameRate: 2,
        repeat: -1,
      });
    }

    if (this.textures.exists('bii-walk') && !this.anims.exists('bii-walk')) {
      this.anims.create({
        key: 'bii-walk',
        frames: this.anims.generateFrameNumbers('bii-walk', { start: 0, end: 7 }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (this.textures.exists('bii-punch') && !this.anims.exists('bii-punch')) {
      this.anims.create({
        key: 'bii-punch',
        frames: this.anims.generateFrameNumbers('bii-punch', { start: 0, end: 3 }),
        frameRate: 14,
        repeat: 0,
      });
    }
  }

  createDeckStage() {
    this.add.rectangle(WORLD_WIDTH / 2, 145, WORLD_WIDTH, 290, 0x75b7db).setOrigin(0.5);
    for (let x = 180; x < WORLD_WIDTH; x += 520) {
      this.add.ellipse(x, 105 + (x % 3) * 18, 210, 54, 0xffffff, 0.72).setDepth(0);
      this.add.ellipse(x + 85, 92 + (x % 4) * 12, 145, 42, 0xffffff, 0.64).setDepth(0);
    }

    this.add.rectangle(WORLD_WIDTH / 2, 292, WORLD_WIDTH, 24, 0x5d3c2b).setDepth(2);
    this.add.rectangle(WORLD_WIDTH / 2, 306, WORLD_WIDTH, 8, 0xd8b16d).setDepth(3);
    this.add.rectangle(WORLD_WIDTH / 2, 420, WORLD_WIDTH, 228, 0xb47a45).setDepth(1);

    for (let x = 0; x < WORLD_WIDTH; x += 150) {
      this.add.rectangle(x, 420, 4, 228, 0x7b4b2d, 0.72).setDepth(1);
    }
    for (let y = 325; y <= 515; y += 46) {
      this.add.rectangle(WORLD_WIDTH / 2, y, WORLD_WIDTH, 3, 0xd7a76d, 0.48).setDepth(1);
    }
    for (let x = 70; x < WORLD_WIDTH; x += 170) {
      this.add.rectangle(x, 280, 12, 88, 0x70452f).setDepth(4);
      this.add.rectangle(x, 238, 16, 18, 0xd1a563).setDepth(5);
    }
    this.add.rectangle(WORLD_WIDTH / 2, 248, WORLD_WIDTH, 10, 0x7b4c31).setDepth(4);

    const mastX = 2040;
    this.add.rectangle(mastX, 178, 38, 355, 0x6d432a).setDepth(4);
    this.add.rectangle(mastX, 92, 250, 18, 0x70462d).setDepth(4);
    this.add.line(mastX - 4, 90, 0, 0, -360, 205, 0x4e3c31, 0.8).setLineWidth(4).setDepth(3);
    this.add.line(mastX + 4, 90, 0, 0, 360, 205, 0x4e3c31, 0.8).setLineWidth(4).setDepth(3);

    [
      { x: 520, y: 320 },
      { x: 1510, y: 465 },
      { x: 2450, y: 330 },
      { x: 3340, y: 455 },
    ].forEach((p) => this.createCrate(p.x, p.y));

    [740, 1660, 2550, 3220].forEach((x, i) => {
      const pole = this.add.rectangle(x, 260, 9, 105, 0x5b3a28).setDepth(3);
      const flag = this.add.triangle(
        x + 34,
        220,
        0,
        0,
        74,
        20,
        0,
        40,
        i % 2 ? 0x2a62a8 : 0xe8d5a7,
        0.92,
      ).setDepth(3);
      pole.setAlpha(0.95);
      flag.setAlpha(0.95);
    });

    this.add.rectangle(WORLD_WIDTH - 135, 385, 8, 230, 0xe7d1a0, 0.75).setDepth(2);
    this.add.text(WORLD_WIDTH - 225, 270, '→ 船首', {
      fontSize: '24px',
      color: '#fff3cf',
      stroke: '#4a2f22',
      strokeThickness: 5,
    }).setDepth(4);
  }

  createCrate(x, y) {
    const box = this.add.rectangle(x, y, 70, 62, 0x84502f).setDepth(y - 2);
    box.setStrokeStyle(5, 0x5d3824, 1);
    this.add.line(x, y, -28, -22, 28, 22, 0xc78d55, 0.9).setLineWidth(4).setDepth(y - 1);
    this.add.line(x, y, 28, -22, -28, 22, 0xc78d55, 0.9).setLineWidth(4).setDepth(y - 1);
  }

  createUi() {
    this.add.text(24, 18, 'GBF 狂扁小朋友 原型 v0.6', {
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    }).setScrollFactor(0).setDepth(30000);

    this.add.text(24, 52, '移动：WASD / 方向键　J：拳　K：重击　L：抓取　双击左右：冲刺　空格：暴怒', {
      fontSize: '15px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setScrollFactor(0).setDepth(30000);

    this.statusText = this.add.text(WIDTH - 24, 18, '', {
      fontSize: '17px',
      color: '#ffffff',
      align: 'right',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(30000);

    this.comboText = this.add.text(WIDTH / 2, 100, '', {
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#fff2a8',
      stroke: '#000000',
      strokeThickness: 7,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30000);

    this.areaText = this.add.text(WIDTH / 2, 152, '', {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30000);

    this.add.text(24, HEIGHT - 54, '蜥蜴怒气槽', {
      fontSize: '15px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setScrollFactor(0).setDepth(30000);

    this.rageBg = this.add.rectangle(24, HEIGHT - 26, 250, 18, 0x111111, 0.75)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(30000);

    this.rageBar = this.add.rectangle(27, HEIGHT - 26, 0, 12, 0xffd43b, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(30001);

    this.progressBg = this.add.rectangle(WIDTH / 2, HEIGHT - 22, 300, 8, 0x111111, 0.62)
      .setScrollFactor(0)
      .setDepth(30000);

    this.progressBar = this.add.rectangle(WIDTH / 2 - 150, HEIGHT - 22, 0, 6, 0xaee6ff, 0.9)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(30001);
  }

  makeTextures() {
    if (this.textures.exists('bii') && this.textures.exists('enemy')) return;
    const g = this.add.graphics();

    g.fillStyle(0x2454a6, 1);
    g.fillRoundedRect(12, 18, 56, 66, 14);
    g.fillStyle(0x17376f, 1);
    g.fillCircle(40, 22, 22);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(32, 18, 4);
    g.fillCircle(48, 18, 4);
    g.fillStyle(0xe8c18f, 1);
    g.fillRect(0, 32, 18, 18);
    g.fillRect(62, 32, 18, 18);
    g.generateTexture('bii', 80, 90);
    g.clear();

    g.fillStyle(0xb74040, 1);
    g.fillRoundedRect(8, 14, 44, 58, 10);
    g.fillStyle(0x3a2020, 1);
    g.fillCircle(30, 16, 17);
    g.generateTexture('enemy', 60, 76);
    g.destroy();
  }

  bindDashInputs() {
    const bindings = [
      ['keydown-LEFT', 'left'], ['keydown-A', 'left'],
      ['keydown-RIGHT', 'right'], ['keydown-D', 'right'],
    ];
    const keyboard = this.input.keyboard;
    const handlers = bindings.map(([eventName, direction]) => {
      const handler = (event) => {
        if (!event.repeat) this.handleDashTap(direction);
      };
      keyboard.on(eventName, handler);
      return [eventName, handler];
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      handlers.forEach(([eventName, handler]) => keyboard.off(eventName, handler));
    });
  }
  handleDashTap(direction) {
    if (!this.player || !this.canPlayerControl() || this.grabbedEnemy) return;
    const now = this.time.now;

    if (now - this.lastHorizontalTap[direction] <= 260) {
      this.startDash(direction === 'right' ? 1 : -1);
      this.lastHorizontalTap[direction] = -9999;
    } else {
      this.lastHorizontalTap[direction] = now;
    }
  }

  startDash(direction) {
    if (!this.canPlayerControl() || this.isDashing || this.time.now < this.attackCooldown || this.grabbedEnemy) return;
    this.isDashing = true;
    this.dashUntil = this.time.now + 260;
    this.player.facing = direction;
    this.player.setVelocity(direction * 520, 0);
    this.player.setFlipX(direction < 0);
  }

  update(time, delta) {
    if (this.gameOver || this.stageComplete) {
      this.clearCombatPresses();
      if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.scene.restart();
      return;
    }

    this.updatePlayerReaction(time, delta);
    this.updateStageFlow();
    if (this.stageComplete) return;
    this.updateRage(time);
    this.updateDash(time);
    this.updatePlayerMovement();
    this.updateHeldEnemy();
    this.updateCombat(time);
    this.updateEnemies(time);
    if (this.gameOver) {
      this.updateUi(time);
      return;
    }
    this.updateThrownEnemies(time);
    this.enforcePlayerBounds();
    this.updatePlayerAppearance(time);
    this.updateUi(time);
  }

  canPlayerControl() {
    return !this.gameOver && !this.stageComplete && canPlayerAct(this.playerState);
  }

  clearCombatPresses() {
    ['J', 'K', 'L', 'SPACE'].forEach((key) => Phaser.Input.Keyboard.JustDown(this.keys[key]));
  }

  updatePlayerReaction(time, delta) {
    const previousPhase = this.playerState.phase;
    const phase = advancePlayerState(this.playerState, time);
    if (phase !== previousPhase) {
      this.player.setVelocity(0, 0);
      if (phase === 'ready') {
        this.player.setAngle(0);
        this.updatePlayerAnimation(false);
      }
    }
    if (phase === 'hurt' || phase === 'knockdown') {
      const damping = Math.exp(-Math.max(0, delta) / 90);
      this.player.setVelocity(this.player.body.velocity.x * damping, 0);
    } else if (phase === 'getup') {
      this.player.setVelocity(0, 0);
    }
    if (phase === 'knockdown') {
      this.player.setAngle(this.playerState.direction * 90);
    } else if (phase === 'getup') {
      const remaining = Phaser.Math.Clamp((this.playerState.until - time) / PLAYER_REACTION.getup, 0, 1);
      this.player.setAngle(this.playerState.direction * 90 * remaining);
    }
  }

  updatePlayerAppearance(time) {
    const phase = this.playerState.phase;
    if (phase === 'hurt') this.player.setTintFill(0xff5c5c);
    else if (phase === 'knockdown' || phase === 'getup') this.player.setTint(0xffc6a3);
    else if (this.isRageActive()) this.player.setTint(0xff725c);
    else if (this.isDashing) this.player.setTint(0xc8f7ff);
    else this.player.clearTint();

    const blinking = time < this.playerState.invulnerableUntil;
    this.player.setAlpha(blinking && Math.floor(time / 80) % 2 ? 0.5 : 1);
    this.player.setDepth(this.player.y);
  }

  isEnemyAlive(enemy) {
    return Boolean(enemy?.active && !enemy.defeated);
  }
  updateStageFlow() {
    if (!this.activeEncounter && !this.stageComplete) {
      const next = this.encounters.find(
        (encounter) => !encounter.cleared && this.player.x >= encounter.triggerX,
      );
      if (next) this.startEncounter(next);
    }

    if (this.activeEncounter && !this.waveTransitionPending && this.pendingWaveSpawns === 0) {
      const alive = this.enemies.filter((enemy) => this.isEnemyAlive(enemy)).length;
      if (alive === 0) {
        this.waveTransitionPending = true;
        this.time.delayedCall(650, () => {
          if (this.gameOver || this.stageComplete || !this.activeEncounter) return;
          const nextWaveIndex = this.currentWaveIndex + 1;
          if (nextWaveIndex < this.activeEncounter.waves.length) {
            this.spawnEncounterWave(nextWaveIndex);
          } else {
            this.completeEncounter();
          }
          this.waveTransitionPending = false;
        });
      }
    }

    if (
      !this.stageComplete &&
      this.encounters.every((encounter) => encounter.cleared) &&
      this.player.x >= WORLD_WIDTH - 260
    ) {
      this.completeStage();
    }
  }

  startEncounter(encounter) {
    this.activeEncounter = encounter;
    this.currentWaveIndex = -1;
    this.waveTransitionPending = true;
    this.lockLeft = encounter.cameraX + 70;
    this.lockRight = encounter.cameraX + WIDTH - 70;

    this.cameras.main.stopFollow();
    this.cameras.main.pan(
      encounter.cameraX + WIDTH / 2,
      HEIGHT / 2,
      380,
      'Sine.easeInOut',
      true,
      (_camera, progress) => {
        if (progress === 1) this.cameras.main.setScroll(encounter.cameraX, 0);
      },
    );

    this.createBattleBarriers(encounter.cameraX);
    this.areaText.setText(`${encounter.name}：敌袭！`);
    this.flashComboLabel('战斗区域封锁！');

    this.time.delayedCall(520, () => {
      if (this.gameOver || this.stageComplete || this.activeEncounter !== encounter) return;
      this.spawnEncounterWave(0);
      this.waveTransitionPending = false;
    });
  }

  createBattleBarriers(cameraX) {
    this.destroyBattleBarriers();
    this.leftBarrier = this.add.rectangle(cameraX + 40, 405, 24, 210, 0xff566b, 0.72).setDepth(25000);
    this.rightBarrier = this.add.rectangle(cameraX + WIDTH - 40, 405, 24, 210, 0xff566b, 0.72).setDepth(25000);

    [this.leftBarrier, this.rightBarrier].forEach((barrier) => {
      this.tweens.add({
        targets: barrier,
        alpha: { from: 0.35, to: 0.9 },
        duration: 420,
        yoyo: true,
        repeat: -1,
      });
    });
  }

  destroyBattleBarriers() {
    [this.leftBarrier, this.rightBarrier].forEach((barrier) => {
      if (barrier) barrier.destroy();
    });
    this.leftBarrier = null;
    this.rightBarrier = null;
  }

  spawnEncounterWave(index) {
    const encounter = this.activeEncounter;
    if (!encounter || this.gameOver || this.stageComplete) return;
    this.enemies = this.enemies.filter((enemy) => enemy.active);
    this.currentWaveIndex = index;
    const wave = encounter.waves[index];
    this.pendingWaveSpawns = wave.length;
    this.areaText.setText(
      `${encounter.name}　第 ${index + 1}/${encounter.waves.length} 波`,
    );
    this.flashComboLabel(`第 ${index + 1} 波！`);

    wave.forEach((pos, enemyIndex) => {
      this.time.delayedCall(enemyIndex * 120, () => {
        if (this.gameOver || this.stageComplete || this.activeEncounter !== encounter
          || this.currentWaveIndex !== index) return;
        this.spawnEnemy(pos.x, pos.y, enemyIndex);
        this.pendingWaveSpawns -= 1;
      });
    });
  }
  spawnEnemy(x, y, index = 0) {
    const enemy = this.physics.add.sprite(x, y, 'enemy');
    enemy.defeated = false;
    enemy.attackCount = 0;
    enemy.pendingAttack = null;
    enemy.hp = 6;
    enemy.maxHp = 6;
    enemy.speed = 52 + (index % 4) * 7;
    enemy.stunUntil = 0;
    enemy.knockedDownUntil = 0;
    enemy.attackReadyAt = this.time.now + 700 + index * 120;
    enemy.grabbed = false;
    enemy.thrownUntil = 0;
    enemy.throwHitTargets = new Set();
    enemy.body.setSize(42, 56);
    enemy.setCollideWorldBounds(true);
    enemy.setAlpha(0);

    this.tweens.add({ targets: enemy, alpha: 1, duration: 180 });
    this.enemies.push(enemy);
  }

  completeEncounter() {
    const finished = this.activeEncounter;
    if (!finished) return;

    finished.cleared = true;
    this.activeEncounter = null;
    this.currentWaveIndex = -1;
    this.lockLeft = 0;
    this.lockRight = WORLD_WIDTH;
    this.destroyBattleBarriers();
    this.areaText.setText(`${finished.name} 已清理`);
    this.showCenterMessage('区域清理完毕！', '继续向右前进', 1300);

    this.time.delayedCall(320, () => {
      if (this.gameOver || this.activeEncounter) return;
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1, -120, 0);
      this.cameras.main.setDeadzone(360, 160);
    });
  }

  completeStage() {
    this.stageComplete = true;
    this.isDashing = false;
    this.player.setVelocity(0, 0);
    this.player.setAngle(0);
    this.updatePlayerAnimation(false);
    this.physics.world.pause();
    this.showCenterMessage('第一段完成！', '格兰赛法甲板已突破', 999999);
    this.add.text(WIDTH / 2, 285, '按 R 再玩一次　·　后续：主甲板 / 船内区域', {
      fontSize: '20px',
      color: '#fff3cf',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31000);
  }

  showCenterMessage(title, subtitle = '', duration = 1200) {
    const titleText = this.add.text(WIDTH / 2, 205, title, {
      fontSize: '44px',
      fontStyle: 'bold',
      color: '#ffe06a',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31000);

    const subtitleText = this.add.text(WIDTH / 2, 255, subtitle, {
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31000);

    if (duration < 900000) {
      this.tweens.add({
        targets: [titleText, subtitleText],
        alpha: 0,
        delay: Math.max(400, duration - 350),
        duration: 350,
        onComplete: () => {
          titleText.destroy();
          subtitleText.destroy();
        },
      });
    }
  }

  updateUi(time) {
    const alive = this.enemies.filter((enemy) => this.isEnemyAlive(enemy)).length;
    const rageActive = time < this.rageUntil;
    const rageLabel = rageActive
      ? `暴怒剩余 ${Math.ceil((this.rageUntil - time) / 1000)} 秒`
      : `怒气 ${Math.round(this.rage)}%`;
    const grabLabel = this.grabbedEnemy?.active ? '\n状态：抓住敌人' : '';
    const phaseLabels = { hurt: '受击硬直', knockdown: '倒地', getup: '起身' };
    const reactionLabel = phaseLabels[this.playerState.phase]
      ? `\n状态：${phaseLabels[this.playerState.phase]}` : '';
    const battleLabel = this.activeEncounter
      ? `\n当前波次 ${this.currentWaveIndex + 1}/${this.activeEncounter.waves.length}`
      : '';

    this.statusText.setText(
      `生命 ${this.player.hp}/${this.player.maxHp}\n场上敌人 ${alive}\n${rageLabel}${grabLabel}${reactionLabel}${battleLabel}`,
    );
    this.rageBar.width = 244 * Phaser.Math.Clamp(this.rage / 100, 0, 1);
    this.rageBar.setFillStyle(rageActive ? 0xff694f : 0xffd43b, 1);
    this.progressBar.width = 300 * Phaser.Math.Clamp(this.player.x / (WORLD_WIDTH - 180), 0, 1);

    if (time > this.comboExpireAt && this.comboCount > 0) {
      this.comboCount = 0;
      this.comboText.setText('');
    }
  }

  updatePlayerMovement() {
    if (!this.canPlayerControl() || this.isDashing) return;

    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;

    const speedMultiplier = this.isRageActive() ? 1.3 : 1;
    const grabPenalty = this.grabbedEnemy ? 0.58 : 1;
    const vector = new Phaser.Math.Vector2(x, y);
    const moving = vector.lengthSq() > 0;

    if (moving) {
      vector.normalize().scale(this.player.baseSpeed * speedMultiplier * grabPenalty);
      this.player.setVelocity(vector.x, vector.y);
      if (Math.abs(vector.x) > 5) this.player.facing = Math.sign(vector.x);
    } else {
      this.player.setVelocity(0, 0);
    }

    this.updatePlayerAnimation(moving);
    this.enforcePlayerBounds();
    this.player.setDepth(this.player.y);
    this.player.setFlipX(this.player.facing < 0);
  }

  updatePlayerAnimation(moving) {
    if (!this.player?.usesSpriteArt || !canPlayerAct(this.playerState)) return;
    if (this.time.now < this.playerAttackAnimationUntil) return;

    if (moving && this.anims.exists('bii-walk')) {
      if (this.player.anims.currentAnim?.key !== 'bii-walk' || !this.player.anims.isPlaying) {
        this.player.play('bii-walk', true);
      }
    } else if (this.anims.exists('bii-idle')) {
      if (this.player.anims.currentAnim?.key !== 'bii-idle' || !this.player.anims.isPlaying) {
        this.player.play('bii-idle', true);
      }
    }
  }

  playPunchAnimation() {
    if (!this.player?.usesSpriteArt || !this.anims.exists('bii-punch')) return;
    this.playerAttackAnimationUntil = this.time.now + 300;
    this.player.play('bii-punch');
  }

  enforcePlayerBounds() {
    this.player.y = Phaser.Math.Clamp(this.player.y, FLOOR_TOP, FLOOR_BOTTOM);
    if (this.activeEncounter) {
      this.player.x = Phaser.Math.Clamp(this.player.x, this.lockLeft, this.lockRight);
      if (this.player.x <= this.lockLeft + 1 && this.player.body.velocity.x < 0) {
        this.player.setVelocityX(0);
      }
      if (this.player.x >= this.lockRight - 1 && this.player.body.velocity.x > 0) {
        this.player.setVelocityX(0);
      }
    } else {
      this.player.x = Phaser.Math.Clamp(this.player.x, 40, WORLD_WIDTH - 40);
    }
  }

  updateDash(time) {
    if (!this.isDashing) return;
    if (time >= this.dashUntil) {
      this.isDashing = false;
      this.player.clearTint();
      this.player.setVelocity(0, 0);
    } else {
      this.enforcePlayerBounds();
      this.player.setDepth(this.player.y);
    }
  }

  updateHeldEnemy() {
    if (!this.grabbedEnemy) return;
    if (!this.grabbedEnemy.active) {
      this.grabbedEnemy = null;
      return;
    }

    const enemy = this.grabbedEnemy;
    enemy.x = this.player.x + this.player.facing * 48;
    enemy.y = this.player.y - 3;
    enemy.setDepth(this.player.y + 1);
    enemy.setFlipX(this.player.facing > 0);
  }

  updateCombat(time) {
    if (!this.canPlayerControl()) {
      this.clearCombatPresses();
      return;
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) &&
      this.rage >= 100 &&
      !this.isRageActive()
    ) {
      this.activateRage();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.L) && time >= this.attackCooldown) {
      if (this.grabbedEnemy) this.releaseGrab(false);
      else this.tryGrabEnemy();
      return;
    }

    if (this.grabbedEnemy) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.J) && time >= this.attackCooldown) {
        this.punchGrabbedEnemy();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.K) && time >= this.attackCooldown) {
        this.throwGrabbedEnemy();
      }
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.J) && time >= this.attackCooldown) {
      if (this.isDashing) this.doDashAttack(false);
      else this.doLightComboAttack(time);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.K) && time >= this.attackCooldown) {
      if (this.isDashing) {
        this.doDashAttack(true);
      } else if (this.comboCount >= 2 && time <= this.comboExpireAt) {
        this.doComboFinisher();
      } else {
        this.comboCount = 0;
        this.doAttack({
          type: 'heavy',
          damage: 2,
          range: 108,
          knockback: 310,
          stun: 400,
          cooldown: 470,
          knockdown: true,
        });
      }
    }
  }

  tryGrabEnemy() {
    if (!this.canPlayerControl()) return;
    let target = null;
    let bestDistance = Infinity;

    this.enemies.forEach((enemy) => {
      if (!this.isEnemyAlive(enemy) || enemy.grabbed || enemy.thrownUntil > this.time.now) return;
      if (enemy.knockedDownUntil > this.time.now) return;

      const dx = enemy.x - this.player.x;
      const dy = Math.abs(enemy.y - this.player.y);
      const inFront = Math.sign(dx || this.player.facing) === this.player.facing;
      const distance = Math.abs(dx) + dy * 0.7;

      if (inFront && Math.abs(dx) <= 76 && dy <= 46 && distance < bestDistance) {
        target = enemy;
        bestDistance = distance;
      }
    });

    if (!target) {
      this.flashComboLabel('没有抓到！');
      this.attackCooldown = this.time.now + 180;
      return;
    }

    this.isDashing = false;
    this.player.clearTint();
    this.player.setVelocity(0, 0);
    this.grabbedEnemy = target;
    this.grabPunchCount = 0;
    this.cancelEnemyAttack(target);
    target.grabbed = true;
    target.setVelocity(0, 0);
    target.body.enable = false;
    this.comboCount = 0;
    this.comboExpireAt = 0;
    this.attackCooldown = this.time.now + 220;
    this.flashComboLabel('抓住了！');
  }

  punchGrabbedEnemy() {
    const enemy = this.grabbedEnemy;
    if (!enemy?.active) {
      this.releaseGrab(false);
      return;
    }

    this.playPunchAnimation();
    const damage = this.isRageActive() ? 2 : 1;
    enemy.hp -= damage;
    this.grabPunchCount += 1;
    this.attackCooldown = this.time.now + 230;
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(70, () => enemy.active && enemy.clearTint());
    this.cameras.main.shake(45, 0.0035);
    this.spawnHitFlash(enemy.x, enemy.y - 8, false);

    if (!this.isRageActive()) this.rage = Phaser.Math.Clamp(this.rage + 6, 0, 100);
    this.flashComboLabel(`抓取痛殴 ×${this.grabPunchCount}`);

    if (enemy.hp <= 0) {
      this.releaseGrab(false);
      this.defeatEnemy(enemy, 240);
    }
  }

  throwGrabbedEnemy() {
    const enemy = this.grabbedEnemy;
    if (!enemy?.active) {
      this.releaseGrab(false);
      return;
    }

    this.grabbedEnemy = null;
    enemy.grabbed = false;
    enemy.body.enable = true;
    enemy.body.moves = true;
    enemy.throwHitTargets = new Set();
    enemy.thrownUntil = this.time.now + 520;
    enemy.stunUntil = enemy.thrownUntil + 700;
    enemy.knockedDownUntil = enemy.thrownUntil + 950;
    enemy.setVelocity(this.player.facing * (this.isRageActive() ? 800 : 650), -20);
    enemy.setAngularVelocity(this.player.facing * 520);
    this.attackCooldown = this.time.now + 520;
    this.grabPunchCount = 0;
    this.flashComboLabel('投掷！');
    this.cameras.main.shake(95, 0.009);
    if (!this.isRageActive()) this.rage = Phaser.Math.Clamp(this.rage + 12, 0, 100);
  }

  releaseGrab(pushAway = true) {
    const enemy = this.grabbedEnemy;
    if (!enemy) return;

    this.grabbedEnemy = null;
    this.grabPunchCount = 0;
    if (!enemy.active) return;

    enemy.grabbed = false;
    enemy.body.enable = true;
    enemy.body.moves = true;
    enemy.stunUntil = this.time.now + 350;
    enemy.setVelocity(pushAway ? this.player.facing * 120 : 0, 0);
  }

  doLightComboAttack(time) {
    this.playPunchAnimation();

    if (time > this.comboExpireAt) this.comboCount = 0;
    this.comboCount = Phaser.Math.Clamp(this.comboCount + 1, 1, 3);
    this.comboExpireAt = time + COMBO_WINDOW;
    const step = this.comboCount;

    if (step === 1) {
      this.doAttack({
        type: 'light1',
        damage: 1,
        range: 82,
        knockback: 95,
        stun: 165,
        cooldown: 175,
      });
    } else if (step === 2) {
      this.doAttack({
        type: 'light2',
        damage: 1,
        range: 88,
        knockback: 120,
        stun: 185,
        cooldown: 190,
      });
    } else {
      this.doAttack({
        type: 'light3',
        damage: 2,
        range: 98,
        knockback: 250,
        stun: 300,
        cooldown: 260,
        knockdown: true,
      });
      this.comboCount = 0;
    }

    this.flashComboLabel(step === 3 ? '三连击！' : `${step} 连击`);
  }

  doComboFinisher() {
    this.comboCount = 0;
    this.comboExpireAt = 0;
    this.flashComboLabel('重拳终结！');
    this.doAttack({
      type: 'finisher',
      damage: 4,
      range: 124,
      knockback: 480,
      stun: 650,
      cooldown: 600,
      knockdown: true,
      shake: 0.011,
    });
  }

  doDashAttack(heavy) {
    this.isDashing = false;
    this.player.clearTint();
    this.flashComboLabel(heavy ? '肌肉碧究极冲撞！' : '冲刺拳！');
    if (!heavy) this.playPunchAnimation();

    this.doAttack({
      type: heavy ? 'dashHeavy' : 'dashLight',
      damage: heavy ? 5 : 2,
      range: heavy ? 142 : 112,
      knockback: heavy ? 570 : 350,
      stun: heavy ? 760 : 420,
      cooldown: heavy ? 720 : 390,
      knockdown: true,
      shake: heavy ? 0.014 : 0.007,
    });
  }

  doAttack(config) {
    if (!this.canPlayerControl()) return;
    const rageMultiplier = this.isRageActive() ? 2 : 1;
    const damage = config.damage * rageMultiplier;
    const knockback = config.knockback * (this.isRageActive() ? 1.45 : 1);
    this.attackCooldown = this.time.now + config.cooldown;

    const attackX = this.player.x + this.player.facing * Math.max(48, config.range * 0.48);
    const isBig = ['heavy', 'finisher', 'dashHeavy'].includes(config.type);
    this.spawnHitFlash(attackX, this.player.y, isBig, config.range);

    let hitCount = 0;
    this.enemies.forEach((enemy) => {
      if (!this.isEnemyAlive(enemy) || enemy.grabbed) return;

      const dx = enemy.x - this.player.x;
      const dy = Math.abs(enemy.y - this.player.y);
      const inFront = Math.sign(dx || this.player.facing) === this.player.facing;
      if (!inFront || Math.abs(dx) > config.range || dy > 58) return;

      this.cancelEnemyAttack(enemy);
      hitCount += 1;
      enemy.hp -= damage;
      enemy.stunUntil = this.time.now + config.stun;
      enemy.setTintFill(0xffffff);
      this.time.delayedCall(75, () => enemy.active && enemy.clearTint());
      enemy.setVelocity(this.player.facing * knockback, 0);

      if (config.knockdown && enemy.hp > 0) {
        this.knockDownEnemy(enemy, config.stun + 650);
      }
      if (enemy.hp <= 0) this.defeatEnemy(enemy, knockback);
    });

    if (hitCount > 0) {
      const rageGain =
        config.type === 'finisher' || config.type === 'dashHeavy'
          ? 18
          : isBig
            ? 11
            : 7;
      if (!this.isRageActive()) {
        this.rage = Phaser.Math.Clamp(this.rage + rageGain * hitCount, 0, 100);
      }
      this.cameras.main.shake(
        isBig ? 90 : 45,
        config.shake ?? (isBig ? 0.007 : 0.0025),
      );
    }
  }

  spawnHitFlash(x, y, big = false, width = null) {
    const flash = this.add.rectangle(
      x,
      y,
      width ?? (big ? 112 : 58),
      big ? 62 : 44,
      big ? 0xffa629 : 0xffff9c,
      0.48,
    ).setDepth(9999);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 95,
      onComplete: () => flash.destroy(),
    });
  }

  knockDownEnemy(enemy, duration) {
    if (!this.isEnemyAlive(enemy) || enemy.grabbed) return;
    this.cancelEnemyAttack(enemy);
    enemy.knockedDownUntil = Math.max(enemy.knockedDownUntil, this.time.now + duration);
    enemy.stunUntil = enemy.knockedDownUntil;
    enemy.setAngle(this.player.facing * 90);
    enemy.setVelocityX(this.player.facing * 180);
  }

  knockDownEnemyFromThrow(enemy, direction, duration) {
    if (!this.isEnemyAlive(enemy)) return;
    this.cancelEnemyAttack(enemy);
    enemy.knockedDownUntil = this.time.now + duration;
    enemy.stunUntil = enemy.knockedDownUntil;
    enemy.setAngle(direction * 90);
    enemy.setVelocity(direction * 340, 0);
  }

  defeatEnemy(enemy, knockback = 280) {
    if (!this.isEnemyAlive(enemy)) return;
    enemy.defeated = true;
    this.cancelEnemyAttack(enemy);
    enemy.setVelocity(0, 0);
    enemy.setAngularVelocity(0);
    if (this.grabbedEnemy === enemy) this.grabbedEnemy = null;

    enemy.grabbed = false;
    if (enemy.body) enemy.body.enable = false;

    this.tweens.add({
      targets: enemy,
      angle: this.player.facing * 150,
      alpha: 0,
      x: enemy.x + this.player.facing * Math.min(180, knockback * 0.38),
      y: enemy.y - 35,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => enemy.destroy(),
    });
  }

  updateEnemies(time) {
    this.enemies.forEach((enemy) => {
      if (this.gameOver || this.stageComplete || !this.isEnemyAlive(enemy) || enemy.grabbed) return;
      enemy.setDepth(enemy.y);
      enemy.y = Phaser.Math.Clamp(enemy.y, FLOOR_TOP, FLOOR_BOTTOM);
      if (this.activeEncounter) {
        enemy.x = Phaser.Math.Clamp(enemy.x, this.lockLeft, this.lockRight);
      }
      if (enemy.thrownUntil > time) return;

      if (enemy.thrownUntil > 0 && time >= enemy.thrownUntil) {
        enemy.thrownUntil = 0;
        enemy.setAngularVelocity(0);
        enemy.setAngle(this.player.facing * 90);
        enemy.setVelocity(0, 0);
      }

      if (enemy.knockedDownUntil > time) {
        enemy.setVelocityX(Phaser.Math.Linear(enemy.body.velocity.x, 0, 0.12));
        return;
      }

      if (enemy.angle !== 0) enemy.setAngle(0);
      if (time < enemy.stunUntil) return;

      if (enemy.pendingAttack) {
        enemy.setVelocity(0, 0);
        if (time >= enemy.pendingAttack.hitAt) this.resolveEnemyAttack(enemy);
        return;
      }

      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Phaser.Math.Distance.Between(
        enemy.x, enemy.y, this.player.x, this.player.y,
      );

      if (distance > 78) {
        const direction = new Phaser.Math.Vector2(dx, dy).normalize();
        enemy.setVelocity(direction.x * enemy.speed, direction.y * enemy.speed);
        enemy.setFlipX(dx < 0);
      } else {
        enemy.setVelocity(0, 0);
        if (time >= enemy.attackReadyAt) this.enemyAttack(enemy);
      }
    });
  }
  updateThrownEnemies(time) {
    if (this.gameOver || this.stageComplete) return;
    this.enemies.forEach((thrownEnemy) => {
      if (!this.isEnemyAlive(thrownEnemy) || thrownEnemy.thrownUntil <= time) return;
      thrownEnemy.setDepth(thrownEnemy.y + 20);

      this.enemies.forEach((target) => {
        if (!this.isEnemyAlive(target) || target === thrownEnemy || target.grabbed) return;
        if (thrownEnemy.throwHitTargets.has(target)) return;

        const dx = Math.abs(target.x - thrownEnemy.x);
        const dy = Math.abs(target.y - thrownEnemy.y);
        if (dx > 58 || dy > 48) return;

        thrownEnemy.throwHitTargets.add(target);
        target.hp -= this.isRageActive() ? 4 : 2;
        target.stunUntil = time + 700;
        target.setTintFill(0xffffff);
        this.time.delayedCall(80, () => target.active && target.clearTint());

        const direction = Math.sign(thrownEnemy.body.velocity.x || this.player.facing);
        target.setVelocity(direction * 420, 0);
        this.knockDownEnemyFromThrow(target, direction, 1050);
        this.spawnHitFlash(target.x, target.y, true, 90);
        this.cameras.main.shake(100, 0.01);

        if (target.hp <= 0) this.defeatEnemy(target, 430);
      });
    });
  }

  enemyAttack(enemy) {
    if (this.gameOver || this.stageComplete || !this.isEnemyAlive(enemy)
      || enemy.grabbed || enemy.pendingAttack) return;
    if (!canPlayerAct(this.playerState)) return;

    const direction = Math.sign(this.player.x - enemy.x) || 1;
    const heavy = (enemy.attackCount + 1) % 3 === 0;
    const range = heavy ? 110 : 88;
    const halfHeight = heavy ? 40 : 32;
    const color = heavy ? 0xffc857 : 0xff6666;
    const marker = this.add.rectangle(
      enemy.x + direction * range / 2, enemy.y, range, halfHeight * 2, color, 0.16,
    ).setStrokeStyle(2, color, 0.9).setDepth(enemy.y - 1);
    const label = this.add.text(enemy.x, enemy.y - 64, heavy ? '重击！' : '！', {
      fontSize: heavy ? '20px' : '26px', color: heavy ? '#ffe28a' : '#ff9b9b',
      stroke: '#3c2020', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(enemy.y + 1);

    enemy.attackCount += 1;
    enemy.setVelocity(0, 0);
    enemy.setFlipX(direction < 0);
    enemy.pendingAttack = {
      x: enemy.x, y: enemy.y, direction, heavy, range, halfHeight,
      hitAt: this.time.now + (heavy ? 560 : 340), marker, label,
    };
    enemy.attackReadyAt = enemy.pendingAttack.hitAt + Phaser.Math.Between(950, 1450);
  }

  cancelEnemyAttack(enemy) {
    if (!enemy.pendingAttack) return;
    enemy.pendingAttack.marker.destroy();
    enemy.pendingAttack.label.destroy();
    enemy.pendingAttack = null;
  }

  resolveEnemyAttack(enemy) {
    const attack = enemy.pendingAttack;
    if (!attack) return;
    this.cancelEnemyAttack(enemy);
    if (this.gameOver || this.stageComplete || !this.isEnemyAlive(enemy) || enemy.grabbed) return;

    const flash = this.add.rectangle(
      attack.x + attack.direction * attack.range / 2, attack.y,
      attack.range, attack.halfHeight * 2, attack.heavy ? 0xffc857 : 0xff6b6b, 0.45,
    ).setDepth(9998);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 100,
      onComplete: () => flash.destroy(),
    });

    const forwardDistance = (this.player.x - attack.x) * attack.direction;
    if (forwardDistance < 0 || forwardDistance > attack.range
      || Math.abs(this.player.y - attack.y) > attack.halfHeight) return;
    this.hurtPlayer(attack.direction, attack.heavy);
  }
  hurtPlayer(direction, knockdown = false) {
    if (this.gameOver || this.stageComplete || this.isRageActive()) return;
    if (!applyPlayerHit(this.playerState, this.time.now, { direction, knockdown })) return;
    if (this.grabbedEnemy) this.releaseGrab(true);

    this.isDashing = false;
    this.dashUntil = 0;
    this.lastHorizontalTap = { left: -9999, right: -9999 };
    this.comboCount = 0;
    this.comboExpireAt = 0;
    this.comboText.setText('');
    this.playerAttackAnimationUntil = 0;
    this.attackCooldown = this.playerState.until + (knockdown ? PLAYER_REACTION.getup : 0);
    this.clearCombatPresses();
    this.player.anims.stop();
    this.player.hp = Math.max(0, this.player.hp - (knockdown ? 2 : 1));
    this.player.setVelocity(direction * (knockdown ? 340 : 220), 0);
    if (knockdown) this.player.setAngle(direction * 90);
    this.cameras.main.shake(knockdown ? 140 : 90, knockdown ? 0.012 : 0.009);
    this.updatePlayerAppearance(this.time.now);

    if (this.player.hp <= 0) this.endGame();
  }
  endGame() {
    this.gameOver = true;
    this.isDashing = false;
    this.enemies.forEach((enemy) => {
      this.cancelEnemyAttack(enemy);
      if (enemy.active && enemy.body) enemy.setVelocity(0, 0);
    });
    this.physics.world.pause();
    this.player.setAlpha(1);
    this.player.setVelocity(0, 0);
    this.player.setAngle(90);
    this.player.setTint(0x777777);

    this.add.text(WIDTH / 2, 185, '你被打倒了！', {
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#ff8d8d',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32000);

    this.add.text(WIDTH / 2, 245, '按 R 重新开始', {
      fontSize: '23px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(32000);
  }

  activateRage() {
    if (!this.canPlayerControl()) return;
    if (this.grabbedEnemy) this.throwGrabbedEnemy();
    this.rage = 100;
    this.rageUntil = this.time.now + RAGE_DURATION;
    this.player.setTint(0xff725c);
    this.cameras.main.flash(180, 255, 240, 170);
    this.cameras.main.shake(360, 0.015);
    this.flashComboLabel('我不是蜥蜴！！');
  }

  updateRage(time) {
    if (this.rageUntil > 0 && time >= this.rageUntil) {
      this.rageUntil = 0;
      this.rage = 0;
      this.player.clearTint();
      this.flashComboLabel('暴怒结束');
    }
  }

  isRageActive() {
    return this.time.now < this.rageUntil;
  }

  flashComboLabel(text) {
    this.comboText.setText(text);
    this.comboText.setScale(1.18);
    this.comboText.setAlpha(1);
    this.tweens.killTweensOf(this.comboText);
    this.tweens.add({
      targets: this.comboText,
      scaleX: 1,
      scaleY: 1,
      duration: 110,
      ease: 'Back.easeOut',
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#111827',
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [PrototypeScene],
});
