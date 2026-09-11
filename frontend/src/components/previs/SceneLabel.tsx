"use client";

import { useMemo, useEffect } from "react";
import * as THREE from "three";

/**
 * Renders text as a camera-facing sprite using a canvas texture.
 *
 * Fully offline (no font CDN — unlike drei <Text>, which fetches Roboto from
 * the web) and cheap to draw: a sprite is a single GPU quad, unlike drei
 * <Html>, which mounts a real DOM node per label. Sprites auto-billboard in
 * both perspective and orthographic (plan view) cameras.
 */
export function SceneLabel({
  text,
  position,
  color = "#94a3b8",
  height = 0.14,
  bold = false,
}: {
  text: string;
  position?: [number, number, number];
  color?: string;
  /** World-space height of the label. */
  height?: number;
  bold?: boolean;
}) {
  const sprite = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    if (!ctx) return sprite;

    const font = `${bold ? "bold " : ""}48px sans-serif`;
    ctx.font = font;
    const w = Math.max(2, Math.ceil(ctx.measureText(text).width) + 20);
    const h = 64;
    canvas.width = w;
    canvas.height = h;
    // The canvas resets after a resize — re-apply the font.
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 6;
    ctx.fillText(text, w / 2, h / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    mat.map = tex;
    const scale = height / h;
    sprite.scale.set(w * scale, h * scale, 1);
    return sprite;
  }, [text, color, height, bold]);

  useEffect(() => {
    return () => {
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
    };
  }, [sprite]);

  return <primitive object={sprite} position={position} />;
}
