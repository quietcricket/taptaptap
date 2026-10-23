import type { Text } from 'pixi.js';
import type { ModeDefinition } from '../engine/types';

export const trainMode: ModeDefinition = {
  id: 'train',
  name: 'Train',
  symbol: '≈',
  description: 'One letter leads to another.',
  create(ctx) {
    const carriages: { text: Text; x: number; y: number; angle: number }[] = [];
    let time = 0;
    return {
      onKey(character) {
        const last = carriages.at(-1);
        const text = ctx.createLetter(
          character,
          ctx.letterSize * 0.85,
          (expired) => {
            const index = carriages.findIndex(
              (carriage) => carriage.text === expired,
            );
            if (index !== -1) carriages.splice(index, 1);
          },
        );
        const carriage = {
          text,
          x: last?.x ?? ctx.bounds.width / 2,
          y: last?.y ?? ctx.bounds.height / 2,
          angle: 0,
        };
        text.position.set(carriage.x, carriage.y);
        carriages.push(carriage);
        ctx.sound('pop', 0.35);
      },
      update(delta) {
        time += delta * (ctx.reducedMotion ? 0.22 : 1);
        const { width, height } = ctx.bounds;
        const headX =
          width / 2 + Math.sin(time * 0.45) * Math.max(20, width / 2 - 100);
        const headY =
          height / 2 + Math.sin(time * 0.8) * Math.max(20, height / 2 - 180);
        for (let i = 0; i < carriages.length; i++) {
          const carriage = carriages[i];
          const previous = carriages[i - 1];
          let tx = headX,
            ty = headY;
          if (previous) {
            const dx = carriage.x - previous.x,
              dy = carriage.y - previous.y;
            const distance = Math.hypot(dx, dy);
            const gap = ctx.letterSize * 0.65;
            tx = previous.x + (distance > 0.1 ? dx / distance : -1) * gap;
            ty = previous.y + (distance > 0.1 ? dy / distance : 0) * gap;
          }
          const ease = 1 - Math.exp(-(i === 0 ? 5 : 9) * delta);
          const dx = (tx - carriage.x) * ease,
            dy = (ty - carriage.y) * ease;
          carriage.x += dx;
          carriage.y += dy;
          if (Math.hypot(dx, dy) > 0.05) {
            const target = Math.atan2(dy, dx);
            const difference = Math.atan2(
              Math.sin(target - carriage.angle),
              Math.cos(target - carriage.angle),
            );
            carriage.angle += difference * ease;
          }
          carriage.text.position.set(carriage.x, carriage.y);
          carriage.text.rotation = ctx.reducedMotion
            ? 0
            : Math.sin(carriage.angle) * 0.3;
        }
      },
      resize() {
        for (const carriage of carriages) {
          carriage.x = Math.min(ctx.bounds.width - 30, carriage.x);
          carriage.y = Math.min(ctx.bounds.height - 150, carriage.y);
        }
      },
      dispose() {
        carriages.length = 0;
      },
    };
  },
};
