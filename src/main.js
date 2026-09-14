import Phaser from 'phaser';
import './style.css';

const WIDTH = 960;
const HEIGHT = 540;
const FLOOR_TOP = 315;
const FLOOR_BOTTOM = 500;
const COMBO_WINDOW = 520;
const RAGE_DURATION = 10000;

class PrototypeScene extends Phaser.Scene {
  constructor() {
    super('PrototypeScene');
    this.enemies = [];
    this.attackCooldown = 0;
    this.waveCleared = false;
    this.comboCount = 0;
    this.comboExpireAt = 0;
    this.lastHorizontalTap = { left: -9999, right: -9999 };
    this.isDashing = false;
    this.dashUntil = 0;
    this.rage = 0;
    this.rageUntil = 0;
    this.gameOver = false;
  }

  create() {
    this.cameras.main.setBackgroundColor('#87a8c7');

    this.add.rectangle(WIDTH / 2, 405, WIDTH, 270, 0xc8b48a);
    this.add.rectangle(WIDTH / 2, 290, WIDTH, 18, 0x6f88a0);
    this.add.text(24, 18, 'GBF 狂扁小朋友 Prototype v0.2', {
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    });
    this.add.text(24, 52, '移动：WASD / 方向键　J：拳　K：重击　←← / →→：冲刺　Space：暴怒', {
      fontSize: '15px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });

    this.statusText = this.add.text(WIDTH - 24, 18, '', {
      fontSize: '17px',
      color: '#ffffff',
      align: 'right',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(1, 0).setDepth(20000);

    this.comboText = this.add.text(WIDTH / 2, 100, '', {
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#fff2a8',
      stroke: '#000000',
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(20000);

    this.makeTextures();

    this.player = this.physics.add.sprite(250, 390, 'bii');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(52, 72);
    this.player.baseSpeed = 230;
    this.player.facing = 1;
    this.player.hp = 10;
    this.player.maxHp = 10;
    this.player.invulnerableUntil = 0;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,J,K,SPACE,R');

    this.createRageUi();
    this.bindDashInputs();
    this.spawnWave();
  }

  makeTextures() {
    const g = this.add.graphics();

    // 肌肉碧占位图：后续会替换成正式 sprite sheet。
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

  createRageUi() {
    this.add.text(24, HEIGHT - 54, 'トカゲゲージ', {
      fontSize: '15px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setDepth(20000);

    this.rageBg = this.add.rectangle(24, HEIGHT - 26, 250, 18, 0x111111, 0.75)
      .setOrigin(0, 0.5)
      .setDepth(20000);
    this.rageBar = this.add.rectangle(27, HEIGHT - 26, 0, 12, 0xffd43b, 1)
      .setOrigin(0, 0.5)
      .setDepth(20001);
  }

  bindDashInputs() {
    const bind = (eventName, direction) => {
      this.input.keyboard.on(eventName, () => this.handleDashTap(direction));
    };

    bind('keydown-LEFT', 'left');
    bind('keydown-A', 'left');
    bind('keydown-RIGHT', 'right');
    bind('keydown-D', 'right');
  }

  handleDashTap(direction) {
    if (!this.player || this.gameOver) return;
    const now = this.time.now;
    if (now - this.lastHorizontalTap[direction] <= 260) {
      this.startDash(direction === 'right' ? 1 : -1);
      this.lastHorizontalTap[direction] = -9999;
    } else {
      this.lastHorizontalTap[direction] = now;
    }
  }

  startDash(direction) {
    if (this.isDashing || this.time.now < this.attackCooldown) return;
    this.isDashing = true;
    this.dashUntil = this.time.now + 260;
    this.player.facing = direction;
    this.player.setVelocity(direction * 520, 0);
    this.player.setTint(0xc8f7ff);
  }

  spawnWave() {
    const positions = [
      { x: 660, y: 350 },
      { x: 760, y: 420 },
      { x: 850, y: 330 },
      { x: 900, y: 465 },
    ];

    positions.forEach((pos, index) => {
      const enemy = this.physics.add.sprite(pos.x, pos.y, 'enemy');
      enemy.hp = 5;
      enemy.maxHp = 5;
      enemy.speed = 52 + index * 7;
      enemy.stunUntil = 0;
      enemy.knockedDownUntil = 0;
      enemy.attackReadyAt = this.time.now + 900 + index * 180;
      enemy.body.setSize(42, 56);
      enemy.setCollideWorldBounds(true);
      this.enemies.push(enemy);
    });
  }

  update(time) {
    if (this.gameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.scene.restart();
      return;
    }

    this.updateRage(time);
    this.updateDash(time);
    this.updatePlayerMovement();
    this.updateCombat(time);
    this.updateEnemies(time);
    this.updateUi(time);

    const alive = this.enemies.filter((enemy) => enemy.active).length;
    if (alive === 0 && !this.waveCleared) {
      this.waveCleared = true;
      this.add.text(WIDTH / 2, 150, 'WAVE CLEAR!', {
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffe06a',
        stroke: '#000000',
        strokeThickness: 8,
      }).setOrigin(0.5).setDepth(20000);
    }
  }

  updateUi(time) {
    const alive = this.enemies.filter((enemy) => enemy.active).length;
    const rageActive = time < this.rageUntil;
    const rageLabel = rageActive ? `暴怒 ${Math.ceil((this.rageUntil - time) / 1000)}s` : `${Math.round(this.rage)}%`;
    this.statusText.setText(`HP ${this.player.hp}/${this.player.maxHp}\n剩余敌人 ${alive}\n${rageLabel}`);

    const rageWidth = 244 * Phaser.Math.Clamp(this.rage / 100, 0, 1);
    this.rageBar.width = rageWidth;
    this.rageBar.setFillStyle(rageActive ? 0xff694f : 0xffd43b, 1);

    if (time > this.comboExpireAt && this.comboCount > 0) {
      this.comboCount = 0;
      this.comboText.setText('');
    }
  }

  updatePlayerMovement() {
    if (this.isDashing) return;

    let x = 0;
    let y = 0;

    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;

    const speedMultiplier = this.isRageActive() ? 1.3 : 1;
    const vector = new Phaser.Math.Vector2(x, y);
    if (vector.lengthSq() > 0) {
      vector.normalize().scale(this.player.baseSpeed * speedMultiplier);
      this.player.setVelocity(vector.x, vector.y);
      if (Math.abs(vector.x) > 5) this.player.facing = Math.sign(vector.x);
    } else {
      this.player.setVelocity(0, 0);
    }

    this.player.y = Phaser.Math.Clamp(this.player.y, FLOOR_TOP, FLOOR_BOTTOM);
    this.player.setDepth(this.player.y);
    this.player.setFlipX(this.player.facing < 0);
  }

  updateDash(time) {
    if (!this.isDashing) return;
    if (time >= this.dashUntil) {
      this.isDashing = false;
      this.player.clearTint();
      this.player.setVelocity(0, 0);
    } else {
      this.player.y = Phaser.Math.Clamp(this.player.y, FLOOR_TOP, FLOOR_BOTTOM);
      this.player.setDepth(this.player.y);
    }
  }

  updateCombat(time) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) && this.rage >= 100 && !this.isRageActive()) {
      this.activateRage();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.J) && time >= this.attackCooldown) {
      if (this.isDashing) {
        this.doDashAttack(false);
      } else {
        this.doLightComboAttack(time);
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.K) && time >= this.attackCooldown) {
      if (this.isDashing) {
        this.doDashAttack(true);
      } else if (this.comboCount >= 2 && time <= this.comboExpireAt) {
        this.doComboFinisher();
      } else {
        this.comboCount = 0;
        this.doAttack({ type: 'heavy', damage: 2, range: 108, knockback: 310, stun: 400, cooldown: 470, knockdown: true });
      }
    }
  }

  doLightComboAttack(time) {
    if (time > this.comboExpireAt) this.comboCount = 0;
    this.comboCount = Phaser.Math.Clamp(this.comboCount + 1, 1, 3);
    this.comboExpireAt = time + COMBO_WINDOW;

    const step = this.comboCount;
    if (step === 1) {
      this.doAttack({ type: 'light1', damage: 1, range: 82, knockback: 95, stun: 165, cooldown: 175 });
    } else if (step === 2) {
      this.doAttack({ type: 'light2', damage: 1, range: 88, knockback: 120, stun: 185, cooldown: 190 });
    } else {
      this.doAttack({ type: 'light3', damage: 2, range: 98, knockback: 250, stun: 300, cooldown: 260, knockdown: true });
      this.comboCount = 0;
    }

    this.flashComboLabel(step === 3 ? 'J-J-J!' : `${step} HIT`);
  }

  doComboFinisher() {
    this.comboCount = 0;
    this.comboExpireAt = 0;
    this.flashComboLabel('J-J-K FINISH!');
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
    this.flashComboLabel(heavy ? 'ULTIMATE BII TACKLE!' : 'DASH PUNCH!');
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
    const rageMultiplier = this.isRageActive() ? 2 : 1;
    const damage = config.damage * rageMultiplier;
    const knockback = config.knockback * (this.isRageActive() ? 1.45 : 1);
    this.attackCooldown = this.time.now + config.cooldown;

    const attackX = this.player.x + this.player.facing * Math.max(48, config.range * 0.48);
    const isBig = ['heavy', 'finisher', 'dashHeavy'].includes(config.type);
    const flash = this.add.rectangle(
      attackX,
      this.player.y,
      config.range,
      isBig ? 62 : 44,
      isBig ? 0xffa629 : 0xffff9c,
      0.48,
    ).setDepth(9999);
    this.tweens.add({ targets: flash, alpha: 0, duration: 95, onComplete: () => flash.destroy() });

    let hitCount = 0;
    this.enemies.forEach((enemy) => {
      if (!enemy.active) return;
      const dx = enemy.x - this.player.x;
      const dy = Math.abs(enemy.y - this.player.y);
      const inFront = Math.sign(dx || this.player.facing) === this.player.facing;
      if (!inFront || Math.abs(dx) > config.range || dy > 58) return;

      hitCount += 1;
      enemy.hp -= damage;
      enemy.stunUntil = this.time.now + config.stun;
      enemy.setTintFill(0xffffff);
      this.time.delayedCall(75, () => enemy.active && enemy.clearTint());
      enemy.setVelocity(this.player.facing * knockback, 0);

      if (config.knockdown && enemy.hp > 0) this.knockDownEnemy(enemy, config.stun + 650);
      if (enemy.hp <= 0) this.defeatEnemy(enemy, knockback);
    });

    if (hitCount > 0) {
      const rageGain = config.type === 'finisher' || config.type === 'dashHeavy' ? 18 : isBig ? 11 : 7;
      if (!this.isRageActive()) this.rage = Phaser.Math.Clamp(this.rage + rageGain * hitCount, 0, 100);
      this.cameras.main.shake(isBig ? 90 : 45, config.shake ?? (isBig ? 0.006 : 0.0025));
    }
  }

  knockDownEnemy(enemy, duration) {
    enemy.knockedDownUntil = Math.max(enemy.knockedDownUntil, this.time.now + duration);
    enemy.setAngle(this.player.facing * 90);
    enemy.setVelocity(this.player.facing * 160, 0);
  }

  defeatEnemy(enemy, knockback) {
    enemy.disableBody(true, false);
    this.tweens.add({
      targets: enemy,
      angle: this.player.facing * 160,
      alpha: 0,
      x: enemy.x + this.player.facing * Math.max(120, knockback * 0.45),
      y: enemy.y - 35,
      duration: 360,
      ease: 'Quad.easeOut',
      onComplete: () => enemy.destroy(),
    });
  }

  updateEnemies(time) {
    this.enemies.forEach((enemy) => {
      if (!enemy.active) return;
      enemy.setDepth(enemy.y);

      if (time < enemy.knockedDownUntil) {
        enemy.setVelocity(enemy.body.velocity.x * 0.9, 0);
        return;
      }

      if (enemy.angle !== 0) {
        enemy.setAngle(0);
        enemy.stunUntil = Math.max(enemy.stunUntil, time + 260);
      }

      if (time < enemy.stunUntil) {
        enemy.setVelocity(enemy.body.velocity.x * 0.82, enemy.body.velocity.y * 0.82);
        return;
      }

      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);

      if (distance > 76) {
        const direction = new Phaser.Math.Vector2(dx, dy).normalize();
        enemy.setVelocity(direction.x * enemy.speed, direction.y * enemy.speed);
        enemy.setFlipX(dx < 0);
      } else {
        enemy.setVelocity(0, 0);
        if (time >= enemy.attackReadyAt) {
          enemy.attackReadyAt = time + Phaser.Math.Between(900, 1400);
          this.enemyAttack(enemy);
        }
      }
    });
  }

  enemyAttack(enemy) {
    if (this.time.now < this.player.invulnerableUntil || this.isRageActive()) return;

    const flash = this.add.circle(enemy.x + (this.player.x > enemy.x ? 28 : -28), enemy.y, 18, 0xff5e5e, 0.55)
      .setDepth(9999);
    this.tweens.add({ targets: flash, alpha: 0, duration: 90, onComplete: () => flash.destroy() });

    this.player.hp -= 1;
    this.player.invulnerableUntil = this.time.now + 850;
    this.player.setTintFill(0xff7777);
    this.cameras.main.shake(80, 0.004);
    this.player.setVelocity(this.player.x > enemy.x ? 260 : -260, -30);
    this.time.delayedCall(120, () => this.player.active && this.player.clearTint());

    if (this.player.hp <= 0) this.handleGameOver();
  }

  activateRage() {
    this.rage = 100;
    this.rageUntil = this.time.now + RAGE_DURATION;
    this.attackCooldown = 0;
    this.cameras.main.flash(260, 255, 235, 130);
    this.cameras.main.shake(350, 0.009);
    this.player.setScale(1.18);
    this.flashComboLabel('オイラはトカゲじゃねぇ！！');
  }

  updateRage(time) {
    if (this.rageUntil === 0) return;
    if (time >= this.rageUntil) {
      this.rageUntil = 0;
      this.rage = 0;
      this.player.setScale(1);
      this.player.clearTint();
    } else {
      this.rage = 100 * ((this.rageUntil - time) / RAGE_DURATION);
      if (Math.floor(time / 100) % 2 === 0) this.player.setTint(0xffd36f);
      else this.player.clearTint();
    }
  }

  isRageActive() {
    return this.time.now < this.rageUntil;
  }

  flashComboLabel(text) {
    this.comboText.setText(text).setAlpha(1).setScale(1.15);
    this.tweens.killTweensOf(this.comboText);
    this.tweens.add({
      targets: this.comboText,
      alpha: 0,
      scale: 1,
      duration: 650,
      ease: 'Quad.easeOut',
    });
  }

  handleGameOver() {
    this.gameOver = true;
    this.player.setVelocity(0, 0);
    this.physics.pause();
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.52).setDepth(30000);
    this.add.text(WIDTH / 2, HEIGHT / 2 - 22, '碧被骑空士狂扁了', {
      fontSize: '44px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(30001);
    this.add.text(WIDTH / 2, HEIGHT / 2 + 38, '按 R 重新开始', {
      fontSize: '22px',
      color: '#ffe06a',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(30001);
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
