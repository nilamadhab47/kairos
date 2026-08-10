import { useReducedMotion } from 'react-native-reanimated';
import { motion } from './tokens';

export { motion };

/**
 * Wrap moti/reanimated transitions so they collapse to instant when the OS
 * reports reduce-motion preference. Keeps callers declarative.
 */
export function useMotionSafeSpring(preset: keyof typeof motion.spring = 'soft') {
  const reduce = useReducedMotion();
  const config = motion.spring[preset];
  if (reduce) return { type: 'timing' as const, duration: 0 };
  return { type: 'spring' as const, ...config };
}

export function useMotionSafeTiming(duration: keyof typeof motion.duration = 'base') {
  const reduce = useReducedMotion();
  return { type: 'timing' as const, duration: reduce ? 0 : motion.duration[duration] };
}
