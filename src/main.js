import Phaser from 'phaser';
import './style.css';

const WIDTH = 960;
const HEIGHT = 540;

class PrototypeScene extends Phaser.Scene {
  constructor() {
    super('PrototypeScene');
    this.enemies = [];
    this.attackCooldown = 0;
    this.heavyCooldown = 0;
    this.waveCleared = false;
  }

  create() {
    this.cameras.main.setBackgroundColor('#87a8c7');

    this.add.rectangle(WIDTH / 2, 405, WIDTH, 270, 0xc8b48a);
    this.add.rectangle(WIDTH / 2, 290, WIDTH, 18, 0x6f88a0);
    this.add.text(24, 18, 'GBF 狂扁小朋友 Prototype', {
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    });
    this.add.text(24, 52, '移动：WASD / 方向键   J：普通拳   K：重拳', {
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });

    this.statusText = this.add.text(WIDTH - 24, 20, '', {
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(1, 0);

    this.makeTextures();

    this.player = this.physics.add.sprite(250, 390, 'bii');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(52, 72);
    this.player.speed = 230;
    this.player.facing = 1;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,J,K');

    this.spawnWave();
  }

  makeTextures() {
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

  spawnWave() {
    const positions = [
      { x: 660, y: 350 },
      { x: 760, y: 420 },
      { x: 850, y: 330 },
    ];

    positions.forEach((pos, index) => {
      const enemy = this.physics.add.sprite(pos.x, pos.y, 'enemy');
      enemy.hp = 3;
      enemy.speed = 55 + index * 8;
      enemy.stunUntil = 0;
      enemy.body.setSize(42, 56);
      enemy.setCollideWorldBounds(true);
      this.enemies.push(enemy);
    });
  }

  update(time) {
    this.updatePlayerMovement();
    this.updateCombat(time);
    this.updateEnemies(time);

    const alive = this.enemies.filter((enemy) => enemy.active).length;
    this.statusText.setText(`剩余敌人：${alive}`);

    if (alive === 0 && !this.waveCleared) {
      this.waveCleared = true;
      this.add.text(WIDTH / 2, 150, 'WAVE CLEAR!', {
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffe06a',
        stroke: '#000000',
        strokeThickness: 8,
      }).setOrigin(0.5);
    }
  }

  updatePlayerMovement() {
    let x = 0;
    let y = 0;

    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;

    const vector = new Phaser.Math.Vector2(x, y);
    if (vector.lengthSq() > 0) {
      vector.normalize().scale(this.player.speed);
      this.player.setVelocity(vector.x, vector.y);
      if (Math.abs(vector.x) > 5) this.player.facing = Math.sign(vector.x);
    } else {
      this.player.setVelocity(0, 0);
    }

    this.player.y = Phaser.Math.Clamp(this.player.y, 315, 500);
    this.player.setDepth(this.player.y);
  }

  updateCombat(time) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.J) && time >= this.attackCooldown) {
      this.attackCooldown = time + 240;
      this.doAttack(false);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.K) && time >= this.heavyCooldown) {
      this.heavyCooldown = time + 500;
      this.doAttack(true);
    }
  }

  doAttack(heavy) {
    const range = heavy ? 105 : 82;
    const damage = heavy ? 2 : 1;
    const knockback = heavy ? 330 : 190;
    const attackX = this.player.x + this.player.facing * (heavy ? 58 : 48);

    const flash = this.add.rectangle(attackX, this.player.y, range, heavy ? 56 : 42, heavy ? 0xffa629 : 0xffff9c, 0.45);
    flash.setDepth(9999);
    this.tweens.add({ targets: flash, alpha: 0, duration: 90, onComplete: () => flash.destroy() });

    this.enemies.forEach((enemy) => {
      if (!enemy.active) return;
      const dx = enemy.x - this.player.x;
      const dy = Math.abs(enemy.y - this.player.y);
      const inFront = Math.sign(dx || this.player.facing) === this.player.facing;
      if (inFront && Math.abs(dx) <= range && dy <= 55) {
        enemy.hp -= damage;
        enemy.stunUntil = this.time.now + (heavy ? 420 : 220);
        enemy.setTintFill(0xffffff);
        this.time.delayedCall(80, () => enemy.active && enemy.clearTint());
        enemy.setVelocity(this.player.facing * knockback, heavy ? -20 : 0);
        this.cameras.main.shake(heavy ? 90 : 45, heavy ? 0.006 : 0.0025);

        if (enemy.hp <= 0) {
          this.tweens.add({
            targets: enemy,
            angle: this.player.facing * 85,
            alpha: 0,
            x: enemy.x + this.player.facing * 100,
            duration: 330,
            onComplete: () => enemy.destroy(),
          });
        }
      }
    });
  }

  updateEnemies(time) {
    this.enemies.forEach((enemy) => {
      if (!enemy.active) return;
      enemy.setDepth(enemy.y);
      if (time < enemy.stunUntil) return;

      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      if (distance > 72) {
        const direction = new Phaser.Math.Vector2(this.player.x - enemy.x, this.player.y - enemy.y).normalize();
        enemy.setVelocity(direction.x * enemy.speed, direction.y * enemy.speed);
      } else {
        enemy.setVelocity(0, 0);
      }
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
