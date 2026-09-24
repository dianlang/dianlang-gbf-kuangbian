import { PLAYER_ART_SOURCES, packPlayerSource } from './player-art.js';
import { PLAYER_ACTIONS, actionFrame } from './player-actions.js';

const names = {
  idle: ['待机', '呼吸循环'], walk: ['行走', 'WASD / 方向键'],
  light1: ['普通拳 · 第一击', 'J'], light2: ['普通拳 · 第二击', 'J → J'],
  light3: ['三连拳终结', 'J → J → J'], heavy: ['重拳', 'K'], finisher: ['重拳终结', 'J → J → K'],
  dash: ['冲刺', '双击左 / 右'], dashLight: ['急停冲刺拳', '冲刺中 J · 起手停步'], dashHeavy: ['急停肩撞', '冲刺中 K · 起手停步'],
  grab: ['抓取', 'L'], grabHold: ['抓取保持', '抓住后可缓慢移动'], grabPunch: ['抓取痛殴', '抓住后 J'],
  throw: ['投掷', '抓住后 K'], release: ['松手', '抓住后 L'], hurt: ['普通受击', '硬直 240 毫秒'],
  knockdown: ['击倒', '倒地 700 毫秒'], getup: ['起身', '起身 280 毫秒'],
  rage: ['暴怒发动', '怒气满时按空格'], rageIdle: ['暴怒待机', '力量展示'], victory: ['胜利', '通关后循环'], defeat: ['战败', '倒下后保持'],
};
const makeCanvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });
const textures = new Map();
const cards = [];
let elapsed = 0, lastTime = performance.now(), paused = false, facing = 1, speed = 1;

async function load() {
  await Promise.all(PLAYER_ART_SOURCES.map(async source => {
    const image = new Image();
    image.src = `/characters/bii/${source.file}`;
    await image.decode();
    textures.set(source.key, packPlayerSource(image, source, makeCanvas));
  }));
  for (const [name, [label, help]] of Object.entries(names)) {
    const card = document.createElement('article');
    const canvas = makeCanvas(320, 280);
    const heading = document.createElement('h2'); heading.textContent = label;
    const description = document.createElement('p'); description.textContent = help;
    card.append(canvas, heading, description); document.querySelector('#gallery').append(card);
    cards.push({ name, context: canvas.getContext('2d') });
  }
  document.querySelector('#status').textContent = `${cards.length} 组动作已就绪`;
  requestAnimationFrame(render);
}

function render(time) {
  if (!paused) elapsed += Math.min(time - lastTime, 100) * speed;
  lastTime = time;
  for (const { name, context: ctx } of cards) {
    const definition = PLAYER_ACTIONS[name];
    const localTime = definition ? elapsed % (definition.duration + (definition.loop ? 0 : 600)) : elapsed;
    const frame = definition ? actionFrame(name, localTime) : {
      texture: `bii-${name}`, frame: Math.floor(elapsed / (name === 'idle' ? 500 : 125)) % (name === 'idle' ? 4 : 8),
    };
    ctx.clearRect(0, 0, 320, 280);
    ctx.fillStyle = '#1d2b3e'; ctx.fillRect(0, 0, 320, 280);
    ctx.strokeStyle = '#668294'; ctx.beginPath(); ctx.moveTo(22, 255); ctx.lineTo(298, 255); ctx.stroke();
    ctx.fillStyle = '#101b29'; ctx.beginPath(); ctx.ellipse(160, 255, 68, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(160, 11); ctx.scale(facing, 1);
    ctx.drawImage(textures.get(frame.texture), frame.frame * 256, 0, 256, 256, -128, 0, 256, 256);
    ctx.restore();
    if (definition?.hit !== undefined && localTime >= definition.hit && localTime < definition.hit + (definition.active ?? 55)) {
      ctx.fillStyle = '#ffcb64'; ctx.fillRect(16, 12, 8, 8);
      ctx.font = '13px system-ui'; ctx.fillText('动作判定', 30, 20);
    }
  }
  requestAnimationFrame(render);
}
document.querySelector('#pause').onclick = event => { paused = !paused; event.target.textContent = paused ? '播放' : '暂停'; };
document.querySelector('#replay').onclick = () => { elapsed = 0; };
document.querySelector('#mirror').onclick = event => { facing *= -1; event.target.textContent = facing === 1 ? '面向左' : '面向右'; };
document.querySelector('#speed').onchange = event => { speed = Number(event.target.value); };
load().catch(error => { document.querySelector('#status').textContent = `素材加载失败：${error.message}`; });
