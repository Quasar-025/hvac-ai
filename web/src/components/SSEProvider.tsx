"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';

interface PipelineState {
  phase: 'idle' | 'sensing' | 'thinking' | 'injecting';
  sensorData: any | null;
  llmTokens: string;
  llmStartInfo: any | null;
  llmDoneInfo: any | null;
  injectionData: any | null;
  connected: boolean;
  timestepCount: number;
  liveMetrics: any | null;
}

const defaultState: PipelineState = {
  phase: 'idle',
  sensorData: null,
  llmTokens: '',
  llmStartInfo: null,
  llmDoneInfo: null,
  injectionData: null,
  connected: false,
  timestepCount: 0,
  liveMetrics: null,
};

const SSEContext = createContext<PipelineState>(defaultState);

export function useSSE() {
  return useContext(SSEContext);
}

export function SSEProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PipelineState>(defaultState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Connect directly to the MCP server SSE endpoint
    const es = new EventSource('http://localhost:8400/stream');
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      console.log('[SSE] Connected to pipeline stream');
      setState(prev => ({ ...prev, connected: true }));
    });

    es.addEventListener('pipeline:phase', (e) => {
      const data = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        phase: data.phase,
        // Reset LLM tokens when entering a new sensing phase
        ...(data.phase === 'sensing' ? { llmTokens: '', llmStartInfo: null, llmDoneInfo: null } : {}),
      }));
    });

    es.addEventListener('pipeline:sensor', (e) => {
      const data = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        sensorData: data,
        timestepCount: prev.timestepCount + 1,
      }));
    });

    es.addEventListener('pipeline:llm_start', (e) => {
      const data = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        llmStartInfo: data,
        llmTokens: '',
        llmDoneInfo: null,
      }));
    });

    es.addEventListener('pipeline:llm_chunk', (e) => {
      const data = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        llmTokens: prev.llmTokens + (data.token || ''),
      }));
    });

    es.addEventListener('pipeline:llm_done', (e) => {
      const data = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        llmDoneInfo: data,
      }));
    });

    es.addEventListener('pipeline:injection', (e) => {
      const data = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        injectionData: data,
      }));
    });

    es.addEventListener('pipeline:metrics', (e) => {
      const data = JSON.parse(e.data);
      setState(prev => ({
        ...prev,
        liveMetrics: data,
      }));
    });

    es.onerror = () => {
      console.log('[SSE] Connection error, reconnecting in 3s...');
      es.close();
      setState(prev => ({ ...prev, connected: false }));
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);

  return (
    <SSEContext.Provider value={state}>
      {children}
    </SSEContext.Provider>
  );
}
