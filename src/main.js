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
    this.grabbedEnemy = null;
    this.grabPunchCount = 0;
  }

  create() {
    this.cameras.main.setBackgroundColor('#87a8c7');

    this.add.rectangle(WIDTH / 2, 405, WIDTH, 270, 0xc8b48a);
    this.add.rectangle(WIDTH / 2, 290, WIDTH, 18, 0x6f88a0);

    this.add.text(24, 18, 'GBF 狂扁小朋友 原型 v0.3', {
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    });

    this.add.text(24, 52, '移动：WASD / 方向键　J：拳　K：重击　L：抓取　双击左右：冲刺　空格：暴怒', {
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
    this.keys = this.input.keyboard.addKeys('W,A,S,D,J,K,L,SPACE,R');

    this.createRageUi();
    this.bindDashInputs();
    this.spawnWave();
  }

  makeTextures() {
    const g = this.add.graphics();

    // 肌肉碧占位图，之后替换为正式精灵图。
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
    this.add.text(24, HEIGHT - 54, '蜥蜴怒气槽', {
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
    if (!this.player || this.gameOver || this.grabbedEnemy) return;
    const now = this.time.now;

    if (now - this.lastHorizontalTap[direction] <= 260) {
      this.startDash(direction === 'right' ? 1 : -1);
      this.lastHorizontalTap[direction] = -9999;
    } else {
      this.lastHorizontalTap[direction] = now;
    }
  }

  startDash(direction) {
    if (this.isDashing || this.time.now < this.attackCooldown || this.grabbedEnemy) return;
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
      enemy.hp = 6;
      enemy.maxHp = 6;
      enemy.speed = 52 + index * 7;
      enemy.stunUntil = 0;
      enemy.knockedDownUntil = 0;
      enemy.attackReadyAt = this.time.now + 900 + index * 180;
      enemy.grabbed = false;
      enemy.thrownUntil = 0;
      enemy.throwHitTargets = new Set();
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
    this.updateHeldEnemy();
    this.updatePlayerMovement();
    this.updateCombat(time);
    this.updateEnemies(time);
    this.updateThrownEnemies(time);
    this.updateUi(time);

    const alive = this.enemies.filter((enemy) => enemy.active).length;
    if (alive === 0 && !this.waveCleared) {
      this.waveCleared = true;
      this.add.text(WIDTH / 2, 150, '清场！', {
        fontSize: '52px',
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
    const rageLabel = rageActive
      ? `暴怒剩余 ${Math.ceil((this.rageUntil - time) / 1000)} 秒`
      : `怒气 ${Math.round(this.rage)}%`;
    const grabLabel = this.grabbedEnemy?.active ? '\n状态：抓住敌人' : '';

    this.statusText.setText(
      `生命 ${this.player.hp}/${this.player.maxHp}\n剩余敌人 ${alive}\n${rageLabel}${grabLabel}`,
    );

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
    const grabPenalty = this.grabbedEnemy ? 0.58 : 1;
    const vector = new Phaser.Math.Vector2(x, y);

    if (vector.lengthSq() > 0) {
      vector.normalize().scale(this.player.baseSpeed * speedMultiplier * grabPenalty);
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
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) && this.rage >= 100 && !this.isRageActive()) {
      this.activateRage();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.L) && time >= this.attackCooldown) {
      if (this.grabbedEnemy) {
        this.releaseGrab(false);
      } else {
        this.tryGrabEnemy();
      }
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
    let target = null;
    let bestDistance = Infinity;

    this.enemies.forEach((enemy) => {
      if (!enemy.active || enemy.grabbed || enemy.thrownUntil > this.time.now) return;
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

    const damage = this.isRageActive() ? 2 : 1;
    enemy.hp -= damage;
    this.grabPunchCount += 1;
    this.attackCooldown = this.time.now + 230;

    enemy.setTintFill(0xffffff);
    this.time.delayedCall(70, () => enemy.active && enemy.clearTint());
    this.cameras.main.shake(45, 0.0035);
    this.spawnHitFlash(enemy.x, enemy.y - 8, false);

    if (!this.isRageActive()) {
      this.rage = Phaser.Math.Clamp(this.rage + 6, 0, 100);
    }

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

    if (!this.isRageActive()) {
      this.rage = Phaser.Math.Clamp(this.rage + 12, 0, 100);
    }
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

    if (pushAway) {
      enemy.setVelocity(this.player.facing * 120, 0);
    } else {
      enemy.setVelocity(0, 0);
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
    this.spawnHitFlash(attackX, this.player.y, isBig, config.range);

    let hitCount = 0;

    this.enemies.forEach((enemy) => {
      if (!enemy.active || enemy.grabbed) return;

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

      if (config.knockdown && enemy.hp > 0) {
        this.knockDownEnemy(enemy, config.stun + 650);
      }

      if (enemy.hp <= 0) {
        this.defeatEnemy(enemy, knockback);
      }
    });

    if (hitCount > 0) {
      const rageGain = config.type === 'finisher' || config.type === 'dashHeavy'
        ? 18
        : isBig
          ? 11
          : 7;

      if (!this.isRageActive()) {
        this.rage = Phaser.Math.Clamp(this.rage + rageGain * hitCount, 0, 100);
      }

      this.cameras.main.shake(isBig ? 90 : 45, config.shake ?? (isBig ? 0.007 : 0.0025));
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
    if (!enemy.active || enemy.grabbed) return;

    enemy.knockedDownUntil = Math.max(enemy.knockedDownUntil, this.time.now + duration);
    enemy.stunUntil = enemy.knockedDownUntil;
    enemy.setAngle(this.player.facing * 90);
    enemy.setVelocityX(this.player.facing * 180);
  }

  defeatEnemy(enemy, knockback = 280) {
    if (!enemy.active) return;

    if (this.grabbedEnemy === enemy) {
      this.grabbedEnemy = null;
    }

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
      if (!enemy.active || enemy.grabbed) return;

      enemy.setDepth(enemy.y);

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

      if (enemy.angle !== 0) {
        enemy.setAngle(0);
      }

      if (time < enemy.stunUntil) return;

      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);

      if (distance > 78) {
        const direction = new Phaser.Math.Vector2(dx, dy).normalize();
        enemy.setVelocity(direction.x * enemy.speed, direction.y * enemy.speed);
        enemy.setFlipX(dx < 0);
      } else {
        enemy.setVelocity(0, 0);
        if (time >= enemy.attackReadyAt) {
          this.enemyAttack(enemy);
          enemy.attackReadyAt = time + Phaser.Math.Between(950, 1450);
        }
      }
    });
  }

  updateThrownEnemies(time) {
    this.enemies.forEach((thrownEnemy) => {
      if (!thrownEnemy.active || thrownEnemy.thrownUntil <= time) return;

      thrownEnemy.setDepth(thrownEnemy.y + 20);

      this.enemies.forEach((target) => {
        if (!target.active || target === thrownEnemy || target.grabbed) return;
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

        if (target.hp <= 0) {
          this.defeatEnemy(target, 430);
        }
      });
    });
  }

  knockDownEnemyFromThrow(enemy, direction, duration) {
    if (!enemy.active) return;
    enemy.knockedDownUntil = this.time.now + duration;
    enemy.stunUntil = enemy.knockedDownUntil;
    enemy.setAngle(direction * 90);
    enemy.setVelocity(direction * 340, 0);
  }

  enemyAttack(enemy) {
    if (this.time.now < this.player.invulnerableUntil || this.isRageActive() || this.grabbedEnemy === enemy) return;

    const dx = Math.abs(enemy.x - this.player.x);
    const dy = Math.abs(enemy.y - this.player.y);
    if (dx > 88 || dy > 54) return;

    const direction = Math.sign(this.player.x - enemy.x) || 1;
    const flash = this.add.rectangle(enemy.x + direction * 35, enemy.y, 58, 36, 0xff6b6b, 0.45)
      .setDepth(9998);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 100,
      onComplete: () => flash.destroy(),
    });

    this.hurtPlayer(direction);
  }

  hurtPlayer(direction) {
    if (this.time.now < this.player.invulnerableUntil || this.isRageActive()) return;

    if (this.grabbedEnemy) {
      this.releaseGrab(true);
    }

    this.player.hp -= 1;
    this.player.invulnerableUntil = this.time.now + 850;
    this.player.setTintFill(0xff5c5c);
    this.player.setVelocity(direction * 220, 0);
    this.cameras.main.shake(90, 0.009);

    this.time.delayedCall(110, () => {
      if (this.player.active && !this.isRageActive()) this.player.clearTint();
    });

    if (this.player.hp <= 0) {
      this.endGame();
    }
  }

  endGame() {
    this.gameOver = true;
    this.player.setVelocity(0, 0);
    this.player.setAngle(90);
    this.player.setTint(0x777777);

    this.add.text(WIDTH / 2, 185, '你被打倒了！', {
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#ff8d8d',
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(30000);

    this.add.text(WIDTH / 2, 245, '按 R 重新开始', {
      fontSize: '23px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(30000);
  }

  activateRage() {
    if (this.grabbedEnemy) {
      this.throwGrabbedEnemy();
    }

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
