import { SIETE, BOSS_IMPACT, createBossState, advanceBossPhase, damageBoss, createBossAttack, bossAttackContains } from './boss-combat.js';

// Scene integration stays separate from the reusable attack/phase rules.
export const BOSS_METHODS = {
  makeBossTexture() {
    if (this.textures.exists('boss-siete')) return;
    const g = this.add.graphics();
    // A readable, oversized placeholder: white cape, gold armor, green hair,
    // and floating blue swords. Replace this texture when commissioned art arrives.
    g.fillStyle(0xdaf7ff);
    [14, 40, 120, 146].forEach((x, i) => {
      g.fillTriangle(x, 2 + i % 2 * 14, x - 5, 58, x + 5, 58);
      g.fillStyle(0xe4b951); g.fillRect(x - 9, 57, 18, 4);
      g.fillStyle(0xdaf7ff);
    });
    g.fillStyle(0xece4cf); g.fillTriangle(80, 40, 22, 168, 138, 168);
    g.fillStyle(0x354862); g.fillRoundedRect(55, 105, 50, 55, 8);
    g.fillStyle(0xb58b43); g.fillRect(52, 146, 23, 42); g.fillRect(86, 146, 23, 42);
    g.fillStyle(0xf0cc6a); g.fillRoundedRect(42, 55, 76, 67, 12);
    g.fillCircle(39, 64, 19); g.fillCircle(121, 64, 19);
    g.fillStyle(0x806235); g.fillRect(50, 104, 60, 9);
    g.fillStyle(0xf1c99a); g.fillCircle(80, 35, 20);
    g.fillStyle(0x80ab74); g.fillEllipse(80, 20, 49, 30);
    g.fillTriangle(57, 17, 60, 48, 71, 23); g.fillTriangle(95, 18, 102, 44, 106, 17);
    g.fillStyle(0x293c38); g.fillRect(68, 35, 7, 3); g.fillRect(85, 35, 7, 3);
    g.generateTexture('boss-siete', 160, 188);
    g.destroy();
  },

  setupBoss(enemy) {
    Object.assign(enemy, createBossState());
    enemy.setOrigin(0.5, 150 / 188); // Same foot level as the player and small enemies.
    enemy.body.setSize(74, 130).setOffset(43, 50);
    enemy.attackReadyAt = this.time.now + 1800;
    this.boss = enemy;
    const textStyle = { fontSize: '16px', color: '#fff4d4', stroke: '#201b2a', strokeThickness: 3 };
    this.bossPanel = this.add.rectangle(480, 197, 470, 76, 0x181a29, 0.92)
      .setStrokeStyle(1, 0xd2b56b).setScrollFactor(0).setDepth(30000);
    this.bossName = this.add.text(480, 164, '', textStyle).setOrigin(0.5, 0).setScrollFactor(0).setDepth(30001);
    this.bossHpBg = this.add.rectangle(260, 190, 440, 9, 0x514251).setOrigin(0, 0.5).setScrollFactor(0).setDepth(30001);
    this.bossHpBar = this.add.rectangle(260, 190, 440, 9, 0xdba45b).setOrigin(0, 0.5).setScrollFactor(0).setDepth(30002);
    this.bossModeBg = this.add.rectangle(260, 207, 440, 5, 0x37394c).setOrigin(0, 0.5).setScrollFactor(0).setDepth(30001);
    this.bossModeBar = this.add.rectangle(260, 207, 440, 5, 0xeb7847).setOrigin(0, 0.5).setScrollFactor(0).setDepth(30002);
    this.bossModeText = this.add.text(480, 215, '', { ...textStyle, fontSize: '13px' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(30001);
    this.enemyHint.setText('神将无法抓取或击倒 · 躲开预警后反击 · 重击更容易打出 Break');
    this.updateBossUi(this.time.now);
  },

  updateBossUi(time) {
    const boss = this.boss;
    if (!boss || !this.bossHpBar) return;
    this.bossName.setText(`希耶提 · 神将形态    ${Math.max(0, boss.hp)} / ${boss.maxHp}`);
    this.bossHpBar.width = 440 * Math.max(0, boss.hp / boss.maxHp);
    let label = '常态 · 留意地面预警，收招时反击';
    let ratio = 0;
    let color = 0xeb7847;
    if (boss.defeated) label = '神将已击败';
    else if (boss.phase === 'overdrive') {
      label = `超限 Overdrive · 剩余 ${boss.modeGauge}% · 用重击削减量表`;
      ratio = boss.modeGauge / 100;
    } else if (boss.phase === 'break') {
      label = `破绽 Break · ${Math.max(0, (boss.breakUntil - time) / 1000).toFixed(1)} 秒 · 伤害 ×1.5`;
      ratio = Math.max(0, (boss.breakUntil - time) / SIETE.breakDuration);
      color = 0x66d9ef;
    }
    this.bossModeBar.width = 440 * ratio;
    this.bossModeBar.setFillStyle(color);
    this.bossModeText.setText(label);
  },

  hideBossUi() {
    ['bossPanel', 'bossName', 'bossHpBg', 'bossHpBar', 'bossModeBg', 'bossModeBar', 'bossModeText']
      .forEach(key => this[key]?.setVisible(false));
  },

  onBossPhaseChange(boss, phase) {
    if (!phase) return;
    this.cancelEnemyAttack(boss);
    boss.setVelocity(0, 0);
    boss.clearTint();
    boss.attackCount = 0;
    boss.recoveryUntil = 0;
    boss.attackReadyAt = phase === 'break' ? boss.breakUntil : this.time.now + 1000;
    this.flashComboLabel(phase === 'overdrive' ? '超限 Overdrive！'
      : phase === 'break' ? 'Break！全力反击！' : '神将恢复架势');
  },

  hitBoss(boss, damage, type) {
    const result = damageBoss(boss, damage, BOSS_IMPACT[type] ?? 0, this.time.now);
    if (!result.damage) return;
    // Boss armor resists flinching and knockback; only Break cancels a cast.
    if (boss.hp > 0) this.onBossPhaseChange(boss, result.transition);
    boss.setTintFill(0xffffff);
    this.time.delayedCall(75, () => boss.active && boss.clearTint());
    if (boss.hp <= 0) this.defeatEnemy(boss, 100);
  },

  updateBoss(boss, time) {
    this.onBossPhaseChange(boss, advanceBossPhase(boss, time));
    if (boss.phase === 'break') {
      boss.setVelocity(0, 0);
      boss.setTint(0x8bdbed);
      return;
    }
    if (boss.pendingAttack) {
      boss.setVelocity(0, 0);
      if (time >= boss.pendingAttack.hitAt) this.resolveBossAttack(boss);
      return;
    }
    if (time < boss.recoveryUntil || time < boss.attackReadyAt) {
      boss.setVelocity(0, 0);
      return;
    }
    boss.clearTint();
    const next = createBossAttack(boss, this.player, this.bossBounds(), time);
    const dx = this.player.x - boss.x;
    const dy = this.player.y - boss.y;
    boss.facing = Math.sign(dx) || boss.facing;
    boss.setFlipX(boss.facing < 0);
    if (next.type === 'sweep' && (Math.abs(dx) > 155 || Math.abs(dy) > 36)) {
      const length = Math.hypot(dx, dy) || 1;
      boss.setVelocity(dx / length * boss.speed, dy / length * boss.speed);
      return;
    }
    this.startBossAttack(boss, next);
  },

  bossBounds() {
    return { left: this.lockLeft, right: this.lockRight, top: 315, bottom: 500 };
  },

  drawBossArea(area, color, alpha) {
    const groundY = area.y + 38; // Lane coordinates sit 38px above every character's feet.
    const marker = area.shape === 'circle'
      ? this.add.ellipse(area.x, groundY, area.radius * 2, area.radius * 2, color, alpha)
      : this.add.rectangle(area.x, groundY, area.width, area.height, color, alpha);
    return marker.setStrokeStyle(3, color, 1).setDepth(10);
  },

  startBossAttack(boss, attack) {
    if (!this.isEnemyAlive(boss) || boss.phase === 'break' || boss.pendingAttack
      || this.gameOver || this.stageComplete) return;
    const color = boss.phase === 'overdrive' ? 0xff824e : 0xffdc72;
    attack.markers = attack.areas.map(area => this.drawBossArea(area, color, 0.24));
    attack.label = this.add.text(480, 252, attack.label, {
      fontSize: '17px', color: '#fff0bc', stroke: '#28192b', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30005);
    boss.pendingAttack = attack;
    boss.attackCount += 1;
    boss.facing = attack.direction;
    boss.setFlipX(boss.facing < 0);
    boss.setVelocity(0, 0);
  },

  resolveBossAttack(boss) {
    const attack = boss.pendingAttack;
    if (!attack) return;
    this.cancelEnemyAttack(boss);
    if (!this.isEnemyAlive(boss) || boss.phase === 'break' || this.gameOver || this.stageComplete) return;
    boss.recoveryUntil = this.time.now + attack.recovery;
    boss.attackReadyAt = boss.recoveryUntil + 180;
    attack.areas.forEach(area => {
      const flash = this.drawBossArea(area, 0xe9faff, 0.62);
      this.tweens.add({ targets: flash, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
    });
    // Overlapping circles/strips still deal a single hit per cast.
    if (bossAttackContains(attack, this.player.x, this.player.y)) {
      this.hurtPlayer(Math.sign(this.player.x - boss.x) || attack.direction, attack.heavy);
    }
  },

  startBossPractice() {
    this.encounters.filter(encounter => !encounter.boss).forEach(encounter => { encounter.cleared = true; });
    const encounter = this.encounters.find(item => item.boss);
    this.player.body.reset(encounter.triggerX + 100, 410);
    this.startEncounter(encounter);
  },
};
