'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * The one WebGL moment: a slow-drifting teal gradient field with low-intensity
 * mouse parallax. Rendered as a fullscreen quad with a cheap fragment shader.
 * Paused entirely when the hero scrolls out of view.
 */
export default function HeroBackdrop() {
  const [visible, setVisible] = useState(true);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      rootMargin: '80px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={holderRef} className="absolute inset-0" aria-hidden>
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'low-power', alpha: false }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <GradientField />
      </Canvas>
    </div>
  );
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uMouse;
uniform float uAspect;

float glow(vec2 p, vec2 c, float r) {
  vec2 d = (p - c) * vec2(uAspect, 1.0);
  return exp(-dot(d, d) / r);
}

void main() {
  vec2 uv = vUv;
  vec3 base = vec3(0.0196, 0.0275, 0.0392); // #05070A
  vec3 teal = vec3(0.243, 0.835, 0.733);    // #3ED5BB
  vec3 deep = vec3(0.09, 0.37, 0.33);       // #175E55-ish

  float t = uTime * 0.06;
  vec2 m = uMouse * 0.035;

  vec3 col = base;
  col += teal * 0.085 * glow(uv, vec2(0.5 + 0.10 * sin(t), 0.86 + 0.05 * cos(t * 1.31)) + m, 0.055);
  col += teal * 0.045 * glow(uv, vec2(0.24 + 0.09 * cos(t * 0.83), 0.42 + 0.09 * sin(t * 0.67)) + m * 1.7, 0.11);
  col += deep * 0.075 * glow(uv, vec2(0.82 + 0.05 * sin(t * 0.9), 0.30 + 0.07 * cos(t * 0.74)) + m * 0.9, 0.15);

  // faint grain so gradients never band
  float g = fract(sin(dot(uv * 700.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.012;

  gl_FragColor = vec4(col, 1.0);
}
`;

function GradientField() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const mouse = useRef({ x: 0, y: 0 });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uAspect: { value: 1 },
    }),
    [],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouse.current.x = e.clientX / window.innerWidth - 0.5;
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame((state, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uAspect.value = state.size.width / state.size.height;
    const mv = uniforms.uMouse.value;
    mv.x += (mouse.current.x - mv.x) * 0.04;
    mv.y += (mouse.current.y - mv.y) * 0.04;
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
