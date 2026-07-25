"use client";

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Edges, Environment } from '@react-three/drei';
import * as THREE from 'three';

function Building() {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = state.clock.elapsedTime * 0.1;
    }
  });

  const zonePositions = [
    [-1, 0.5, -0.5], [1, 0.5, -0.5],
    [-1, 0.5, 0.5], [1, 0.5, 0.5],
    [0, 0.5, 0] // Core
  ];

  return (
    <group ref={group}>
      {/* Base Plenum */}
      <mesh position={[0, -0.25, 0]}>
        <boxGeometry args={[3, 0.5, 2]} />
        <meshPhysicalMaterial 
          color="#1e293b" 
          metalness={0.8} 
          roughness={0.2} 
          transparent 
          opacity={0.8} 
        />
        <Edges scale={1} threshold={15} color="#3b82f6" />
      </mesh>

      {/* 5 Zones */}
      {zonePositions.map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <boxGeometry args={[0.85, 1, 0.85]} />
          <meshPhysicalMaterial 
            color="#3b82f6" 
            metalness={0.5} 
            roughness={0.2} 
            transparent 
            opacity={0.4} 
            transmission={0.9}
            thickness={1}
          />
          <Edges scale={1} threshold={15} color="#10b981" />
        </mesh>
      ))}
    </group>
  );
}

export default function DigitalTwin() {
  return (
    <div className="w-full h-[300px] rounded-xl overflow-hidden bg-slate-900/50 border border-slate-700/50 relative">
      <div className="absolute top-4 left-4 z-10 bg-slate-800/80 backdrop-blur text-xs font-semibold px-2 py-1 rounded border border-slate-700 text-blue-400">
        LIVE DIGITAL TWIN
      </div>
      <Canvas camera={{ position: [4, 3, 5], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} color="#3b82f6" />
        <directionalLight position={[-5, 3, -5]} intensity={0.5} color="#10b981" />
        <Building />
        <OrbitControls enableZoom={false} autoRotate={false} />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
