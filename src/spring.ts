export interface Spring {
  value: number;
  target: number;
  velocity: number;
}

export function createSpring(v: number): Spring {
  return { value: v, target: v, velocity: 0 };
}

export function stepSpring(
  s: Spring,
  tension: number,
  damping: number,
  dt: number,
): boolean {
  s.velocity = (s.velocity + (s.target - s.value) * tension * dt) * damping;
  s.value += s.velocity * dt;
  return (
    Math.abs(s.target - s.value) > 0.005 || Math.abs(s.velocity) > 0.005
  );
}
