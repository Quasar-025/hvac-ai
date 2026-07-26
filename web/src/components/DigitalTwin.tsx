"use client";

import { useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Edges, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';

function Building({ latestData }: { latestData?: any }) {
  const group = useRef<THREE.Group>(null);
  const [activeZone, setActiveZone] = useState<number | null>(null);

  // Remove explicit useFrame rotation to allow OrbitControls to handle it interactively

  const zonePositions = [
    [-1, 0.5, -0.5], [1, 0.5, -0.5],
    [-1, 0.5, 0.5], [1, 0.5, 0.5],
    [0, 0.5, 0] // Core
  ];
  
  const zoneNames = ['SPACE1-1', 'SPACE2-1', 'SPACE3-1', 'SPACE4-1', 'SPACE5-1'];

  return (
    <group ref={group} onClick={(e) => e.stopPropagation()}>
      {/* Base Plenum */}
      <mesh position={[0, -0.25, 0]}>
        <boxGeometry args={[3, 0.5, 2]} />
        <meshPhysicalMaterial 
          color="#141726" 
          metalness={0.8} 
          roughness={0.2} 
          transparent 
          opacity={0.8} 
        />
        <Edges scale={1} threshold={15} color="#818cf8" />
      </mesh>

      {/* 5 Zones */}
      {zonePositions.map((pos, i) => {
        const zoneName = zoneNames[i];
        const zoneData = latestData?.zones?.[zoneName] || {};
        const isHovered = activeZone === i;
        
        return (
          <mesh 
            key={i} 
            position={pos as [number, number, number]}
            onClick={(e) => {
              e.stopPropagation();
              setActiveZone(activeZone === i ? null : i);
            }}
            onPointerMissed={() => setActiveZone(null)}
          >
            <boxGeometry args={[0.85, 1, 0.85]} />
            <meshPhysicalMaterial 
              color={isHovered ? "#818cf8" : "#6366f1"} 
              metalness={0.5} 
              roughness={0.2} 
              transparent 
              opacity={isHovered ? 0.7 : 0.4} 
              transmission={0.9}
              thickness={1}
            />
            <Edges scale={1} threshold={15} color={isHovered ? "#ffffff" : "#34d399"} />
            
            {/* HTML Overlay Tooltip */}
            {isHovered && (
              <Html position={[0, 0.6, 0]} center zIndexRange={[100, 0]}>
                <div
                  className="glass-card p-3 text-xs w-40 pointer-events-none animate-fade-in"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <div className="font-bold mb-2 pb-1" style={{ color: 'var(--accent-primary)', borderBottom: '1px solid var(--divider)' }}>
                    {zoneName}
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Temp:</span>
                    <span className="font-mono">{zoneData.temp_c || '--'}°C</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Occupancy:</span>
                    <span className="font-mono">{zoneData.occupancy || 0}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>CO2:</span>
                    <span className="font-mono">{zoneData.co2_ppm || '--'} ppm</span>
                  </div>
                  <div className="flex justify-between text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                    <span>H: {zoneData.htg_setpoint_c || '--'}°C</span>
                    <span>C: {zoneData.clg_setpoint_c || '--'}°C</span>
                  </div>
                </div>
              </Html>
            )}
          </mesh>
        );
      })}
    </group>
  );
}

export default function DigitalTwin({ latestData }: { latestData?: any }) {
  return (
    <div className="w-full h-[300px] rounded-2xl overflow-hidden glass-card relative">
      <div
        className="absolute top-4 left-4 z-10 text-xs font-semibold px-2.5 py-1 rounded-lg glass-surface"
        style={{ color: 'var(--accent-primary)' }}
      >
        LIVE DIGITAL TWIN
      </div>
      <div
        className="absolute bottom-4 right-4 z-10 text-[10px] px-2 py-1 rounded glass-surface"
        style={{ color: 'var(--text-muted)' }}
      >
        Drag to rotate • Scroll to zoom
      </div>
      <Canvas camera={{ position: [4, 3, 5], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} color="#6366f1" />
        <directionalLight position={[-5, 3, -5]} intensity={0.5} color="#34d399" />
        <Building latestData={latestData} />
        <OrbitControls enableZoom={true} enablePan={true} autoRotate={true} autoRotateSpeed={1} />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
