"use client";

import { Dithering, MeshGradient } from "@paper-design/shaders-react";

export function PaperMeshBackground({
  opacity = 0.35,
  className
}: {
  opacity?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity
      }}
    >
      <Dithering
        speed={0.15}
        shape="warp"
        type="4x4"
        size={2.5}
        scale={1}
        colorBack="#00000000"
        colorFront="#8CE7A0"
        style={{ backgroundColor: 'transparent', width: "100%", height: "100%" }}
      >
        <MeshGradient
          speed={0.015}
          distortion={0.8}
          swirl={0.1}
          grainMixer={0}
          grainOverlay={0}
          frame={176868.9}
          colors={['#E0EAFF', '#241D9A', '#F75092', '#516DF0']}
          style={{ width: "100%", height: "100%" }}
        />
      </Dithering>
    </div>
  );
}
